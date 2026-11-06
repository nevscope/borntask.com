import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { sendError, validation } from '../errors.js';
import { accessRequestKey, DIGEST_SENT_KIND, presentNotification, projectInviteKey } from '../lib/presentNotification.js';

type NotifyDb = Awaited<ReturnType<typeof requireAuth>>['db'];

const actorBackfillTried = new Set<string>();

function nearest<T>(rows: T[], at: Date, when: (row: T) => Date): T | undefined {
  return rows.reduce<T | undefined>((best, row) => {
    if (!best) return row;
    return Math.abs(when(row).getTime() - at.getTime()) < Math.abs(when(best).getTime() - at.getTime()) ? row : best;
  }, undefined);
}

async function backfillActors(db: NotifyDb, rows: { id: string; actorId: string | null; kind: string; taskId: string | null; userId: string; createdAt: Date }[]) {
  const missing = rows.filter((row) => !row.actorId && !actorBackfillTried.has(row.id));
  for (const row of missing) actorBackfillTried.add(row.id);
  if (!missing.length) return false;

  const commentTaskIds = [...new Set(missing.filter((row) => row.taskId && (row.kind === 'mention' || row.kind === 'watched_comment')).map((row) => row.taskId!))];
  const activityTaskIds = [...new Set(missing.filter((row) => row.taskId && (row.kind === 'assigned' || row.kind === 'moved')).map((row) => row.taskId!))];
  const projectKeys = [...new Set(missing.flatMap((row) => {
    const key = projectInviteKey(row.kind) ?? accessRequestKey(row.kind);
    return key ? [key] : [];
  }))];

  const [comments, activities, projects] = await Promise.all([
    commentTaskIds.length
      ? db.comment.findMany({ where: { taskId: { in: commentTaskIds }, deletedAt: null }, select: { taskId: true, authorId: true, createdAt: true } })
      : Promise.resolve([]),
    activityTaskIds.length
      ? db.activityLog.findMany({ where: { taskId: { in: activityTaskIds }, actorId: { not: null } }, select: { taskId: true, actorId: true, at: true } })
      : Promise.resolve([]),
    projectKeys.length
      ? db.project.findMany({ where: { key: { in: projectKeys } }, select: { id: true, key: true } })
      : Promise.resolve([]),
  ]);
  const projectIds = projects.map((project) => project.id);
  const byKey = new Map(projects.map((project) => [project.key, project.id]));
  const [requests, invitations, accepted] = await Promise.all([
    projectIds.length
      ? db.accessRequest.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, requesterId: true, createdAt: true } })
      : Promise.resolve([]),
    projectIds.length
      ? db.invitation.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, invitedById: true, createdAt: true } })
      : Promise.resolve([]),
    missing.some((row) => row.kind === 'invite')
      ? db.invitation.findMany({
        where: { invitedById: { in: [...new Set(missing.filter((row) => row.kind === 'invite').map((row) => row.userId))] }, acceptedAt: { not: null } },
        select: { invitedById: true, email: true, acceptedAt: true },
      })
      : Promise.resolve([]),
  ]);
  const acceptedEmails = [...new Set(accepted.map((row) => row.email.toLowerCase()))];
  const acceptedUsers = acceptedEmails.length
    ? await db.user.findMany({ where: { email: { in: acceptedEmails } }, select: { id: true, email: true } })
    : [];
  const userByEmail = new Map(acceptedUsers.map((user) => [user.email.toLowerCase(), user.id]));

  const patches: { id: string; actorId: string }[] = [];
  for (const row of missing) {
    let actorId: string | undefined;
    if (row.taskId && (row.kind === 'mention' || row.kind === 'watched_comment')) {
      actorId = nearest(comments.filter((item) => item.taskId === row.taskId), row.createdAt, (item) => item.createdAt)?.authorId;
    } else if (row.taskId && (row.kind === 'assigned' || row.kind === 'moved')) {
      actorId = nearest(activities.filter((item) => item.taskId === row.taskId), row.createdAt, (item) => item.at)?.actorId ?? undefined;
    } else if (accessRequestKey(row.kind) || row.kind === 'access_request') {
      const projectId = byKey.get(accessRequestKey(row.kind) ?? '');
      actorId = nearest(requests.filter((item) => item.projectId === projectId), row.createdAt, (item) => item.createdAt)?.requesterId;
    } else if (projectInviteKey(row.kind)) {
      const projectId = byKey.get(projectInviteKey(row.kind) ?? '');
      actorId = nearest(invitations.filter((item) => item.projectId === projectId), row.createdAt, (item) => item.createdAt)?.invitedById;
    } else if (row.kind === 'invite') {
      const invite = nearest(accepted.filter((item) => item.invitedById === row.userId && item.acceptedAt), row.createdAt, (item) => item.acceptedAt!);
      actorId = invite ? userByEmail.get(invite.email.toLowerCase()) : undefined;
    }
    if (actorId) patches.push({ id: row.id, actorId });
  }
  await Promise.all(patches.map((patch) => db.notification.update({ where: { id: patch.id }, data: { actorId: patch.actorId } })));
  return patches.length > 0;
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  const include = {
    task: { select: { number: true, title: true, project: { select: { key: true } } } },
    actor: { select: { id: true, name: true, email: true } },
  } as const;

  function inboxFilter(userId: string) {
    return { userId, kind: { not: DIGEST_SENT_KIND } };
  }

  async function listFor(auth: Awaited<ReturnType<typeof requireAuth>>) {
    const where = inboxFilter(auth.userId);
    const [unread, recent] = await Promise.all([
      auth.db.notification.findMany({
        where: { ...where, readAt: null },
        include,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      auth.db.notification.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
    ]);
    const byId = new Map<string, (typeof unread)[number]>();
    for (const row of [...unread, ...recent]) byId.set(row.id, row);
    const merged = [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (await backfillActors(auth.db, merged)) {
      const ids = merged.map((row) => row.id);
      return auth.db.notification.findMany({
        where: { id: { in: ids } },
        include,
        orderBy: { createdAt: 'desc' },
      });
    }
    return merged;
  }

  function payload(rows: Awaited<ReturnType<typeof listFor>>) {
    const items = rows.map(presentNotification).filter((row): row is NonNullable<typeof row> => row !== null);
    return { items, unreadCount: items.filter((row) => !row.readAt).length };
  }

  app.get('/me/notifications', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      return payload(await listFor(auth));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/me/notifications/read', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const input = z.object({ id: z.string().optional(), all: z.boolean().optional() }).parse(req.body ?? {});
      if (!input.all && !input.id) throw validation('Pass id or all.');
      await auth.db.notification.updateMany({
        where: {
          userId: auth.userId,
          readAt: null,
          ...(input.all ? {} : { id: input.id }),
        },
        data: { readAt: new Date() },
      });
      return payload(await listFor(auth));
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
