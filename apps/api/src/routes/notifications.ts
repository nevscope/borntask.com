import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { sendError, validation } from '../errors.js';
import { taskKey } from '../lib/loadProject.js';
import { mapUser } from '../lib/mappers.js';

const kindSchema = z.enum(['mention', 'assigned', 'moved', 'invite', 'github', 'access_request']);

function projectInviteKey(kind: string): string | null {
  return kind.startsWith('project_invite:') ? kind.slice('project_invite:'.length) || null : null;
}

function accessRequestKey(kind: string): string | null {
  return kind.startsWith('access_request:') ? kind.slice('access_request:'.length) || null : null;
}

function who(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || 'Someone';
}

function textFor(kind: string, title: string | null, key: string | null, actorName: string | null) {
  const invited = projectInviteKey(kind);
  if (invited) return `${who(actorName)} invited you to ${invited}`;
  const requested = accessRequestKey(kind);
  if (requested) return `${who(actorName)} asked to open ${requested}`;
  const label = title ?? key ?? 'a task';
  const actor = who(actorName);
  if (kind === 'mention') return `${actor} mentioned you on ${label}`;
  if (kind === 'assigned') return `You were assigned ${label}`;
  if (kind === 'moved') return `${label} moved stage`;
  if (kind === 'watched_comment') return `${actor} commented on ${label}`;
  if (kind === 'invite') return `${actor} accepted an invitation`;
  if (kind === 'github') return `A linked pull request updated ${key ?? label}`;
  if (kind === 'access_granted') return 'You can now open the project you asked for.';
  if (kind === 'access_declined') return 'Your request to open a project was declined.';
  if (kind === 'access_request') return `${actor} asked to open a project.`;
  return label;
}

function present(
  row: {
    id: string;
    kind: string;
    readAt: Date | null;
    createdAt: Date;
    actor: { id: string; name: string; email: string } | null;
    task: { number: number; title: string; project: { key: string } } | null;
  },
) {
  const invited = projectInviteKey(row.kind);
  const requested = accessRequestKey(row.kind);
  const parsed = kindSchema.safeParse(row.kind);
  const kind = parsed.success
    ? parsed.data
    : invited
    ? 'invite'
    : requested || row.kind === 'access_request'
      ? 'access_request'
      : row.kind === 'access_granted' || row.kind === 'access_declined'
        ? 'invite'
        : row.kind === 'watched_comment'
          ? 'mention'
          : 'moved';
  const key = row.task ? taskKey(row.task.project.key, row.task.number) : null;
  return {
    id: row.id,
    kind,
    text: textFor(row.kind, row.task?.title ?? null, key, row.actor?.name ?? null),
    taskKey: key,
    projectKey: invited ?? requested ?? row.task?.project.key ?? null,
    needsAccept: Boolean(invited),
    actor: row.actor ? mapUser(row.actor) : null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

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

  async function listFor(auth: Awaited<ReturnType<typeof requireAuth>>) {
    const first = await auth.db.notification.findMany({
      where: { userId: auth.userId },
      include,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (await backfillActors(auth.db, first)) {
      return auth.db.notification.findMany({
        where: { userId: auth.userId },
        include,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }
    return first;
  }

  async function unreadFor(auth: Awaited<ReturnType<typeof requireAuth>>) {
    return auth.db.notification.count({ where: { userId: auth.userId, readAt: null } });
  }

  app.get('/me/notifications', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const [rows, unreadCount] = await Promise.all([listFor(auth), unreadFor(auth)]);
      return { items: rows.map(present), unreadCount };
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
      const [rows, unreadCount] = await Promise.all([listFor(auth), unreadFor(auth)]);
      return { items: rows.map(present), unreadCount };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
