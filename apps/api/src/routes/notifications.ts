import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { prisma } from '../db.js';
import { sendError, validation } from '../errors.js';
import { taskKey } from '../lib/loadProject.js';
import { mapUser } from '../lib/mappers.js';
import { parseAccessNotifyKind } from '../lib/accessNotify.js';
import { parseMovedKind } from '../lib/stageNotify.js';

const kindSchema = z.enum(['mention', 'assigned', 'moved', 'invite', 'github', 'access_request', 'comment']);

function projectInviteKey(kind: string): string | null {
  return kind.startsWith('project_invite:') ? kind.slice('project_invite:'.length) || null : null;
}

function who(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || 'Someone';
}

function jsonStatus(value: unknown): string {
  if (!value || typeof value !== 'object' || !('status' in value)) return '';
  return String((value as { status: unknown }).status ?? '');
}

function textFor(
  kind: string,
  title: string | null,
  key: string | null,
  actorName: string | null,
  from: string | null,
  to: string | null,
  handlerName: string | null,
) {
  const invited = projectInviteKey(kind);
  if (invited) return `${who(actorName)} invited you to ${invited}`;
  const access = parseAccessNotifyKind(kind);
  if (access?.state === 'handled') {
    const verb = access.outcome === 'declined' ? 'Declined' : 'Approved';
    return `${verb} by ${who(handlerName)} · cleared for everyone`;
  }
  if (access) return `${who(actorName)} asked to open ${access.projectKey || 'a project'}`;
  const label = title ?? key ?? 'a task';
  const actor = who(actorName);
  if (kind === 'mention') return `${actor} mentioned you on ${label}`;
  if (kind === 'assigned') return `You were assigned ${label}`;
  if (from && to) return `${from} → ${to}`;
  if (kind === 'moved' || parseMovedKind(kind)) return `${label} moved stage`;
  if (kind === 'watched_comment' || kind === 'reported_comment' || kind === 'comment') return `${actor} commented on ${label}`;
  if (kind === 'invite') return `${actor} accepted an invitation`;
  if (kind === 'github') return `A linked pull request updated ${key ?? label}`;
  if (kind === 'access_granted') return 'You can now open the project you asked for.';
  if (kind === 'access_declined') return 'Your request to open a project was declined.';
  return label;
}

function publicKind(raw: string): z.infer<typeof kindSchema> {
  const invited = projectInviteKey(raw);
  const access = parseAccessNotifyKind(raw);
  const parsed = kindSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (invited) return 'invite';
  if (access) return 'access_request';
  if (raw === 'access_granted' || raw === 'access_declined') return 'invite';
  if (raw === 'watched_comment' || raw === 'reported_comment') return 'comment';
  if (parseMovedKind(raw) || raw.startsWith('moved')) return 'moved';
  return 'moved';
}

function present(
  row: {
    id: string;
    kind: string;
    readAt: Date | null;
    createdAt: Date;
    actor: { id: string; name: string; email: string } | null;
    task: {
      number: number;
      title: string;
      reporterId: string;
      assigneeId: string | null;
      project: { key: string };
    } | null;
  },
  stage: { from: string | null; to: string | null },
  handler: { id: string; name: string; email: string } | null,
) {
  const invited = projectInviteKey(row.kind);
  const access = parseAccessNotifyKind(row.kind);
  const kind = publicKind(row.kind);
  const key = row.task ? taskKey(row.task.project.key, row.task.number) : null;
  const pendingAccess = access?.state === 'pending';
  return {
    id: row.id,
    kind,
    text: textFor(row.kind, row.task?.title ?? null, key, row.actor?.name ?? null, stage.from, stage.to, handler?.name ?? null),
    taskKey: key,
    projectKey: invited ?? (access?.projectKey || null) ?? row.task?.project.key ?? null,
    taskTitle: row.task?.title ?? null,
    fromStatus: stage.from,
    toStatus: stage.to,
    reporterId: row.task?.reporterId ?? null,
    assigneeId: row.task?.assigneeId ?? null,
    needsAccept: Boolean(invited),
    requestId: access?.requestId ?? null,
    outcome: access?.state === 'handled' ? access.outcome : null,
    handledBy: handler ? mapUser(handler) : null,
    actor: row.actor ? mapUser(row.actor) : null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    needsAction: Boolean(invited) || pendingAccess,
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

  const commentTaskIds = [...new Set(missing.filter((row) => row.taskId && (row.kind === 'mention' || row.kind === 'watched_comment' || row.kind === 'reported_comment')).map((row) => row.taskId!))];
  const activityTaskIds = [...new Set(missing.filter((row) => row.taskId && (row.kind === 'assigned' || row.kind === 'moved' || parseMovedKind(row.kind))).map((row) => row.taskId!))];
  const projectKeys = [...new Set(missing.flatMap((row) => {
    const key = projectInviteKey(row.kind) ?? parseAccessNotifyKind(row.kind)?.projectKey;
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
    if (row.taskId && (row.kind === 'mention' || row.kind === 'watched_comment' || row.kind === 'reported_comment')) {
      actorId = nearest(comments.filter((item) => item.taskId === row.taskId), row.createdAt, (item) => item.createdAt)?.authorId;
    } else if (row.taskId && (row.kind === 'assigned' || row.kind === 'moved' || parseMovedKind(row.kind))) {
      actorId = nearest(activities.filter((item) => item.taskId === row.taskId), row.createdAt, (item) => item.at)?.actorId ?? undefined;
    } else if (parseAccessNotifyKind(row.kind)) {
      const projectId = byKey.get(parseAccessNotifyKind(row.kind)?.projectKey ?? '');
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
    task: {
      select: {
        number: true,
        title: true,
        reporterId: true,
        assigneeId: true,
        project: {
          select: {
            key: true,
            workflow: { select: { statuses: { select: { slug: true, name: true } } } },
          },
        },
      },
    },
    actor: { select: { id: true, name: true, email: true } },
  } as const;

  async function stagesFor(
    db: NotifyDb,
    rows: {
      id: string;
      kind: string;
      taskId: string | null;
      createdAt: Date;
      task: { project: { workflow: { statuses: { slug: string; name: string }[] } } } | null;
    }[],
  ) {
    const names = new Map<string, { from: string | null; to: string | null }>();
    const need: typeof rows = [];
    for (const row of rows) {
      const parsed = parseMovedKind(row.kind);
      if (parsed) names.set(row.id, parsed);
      else if (row.kind === 'moved' || row.kind.startsWith('moved')) need.push(row);
    }
    const taskIds = [...new Set(need.map((row) => row.taskId).filter((id): id is string => Boolean(id)))];
    const activities = taskIds.length
      ? await db.activityLog.findMany({
        where: { taskId: { in: taskIds } },
        select: { taskId: true, at: true, fromJson: true, toJson: true },
      })
      : [];
    for (const row of need) {
      if (!row.taskId) {
        names.set(row.id, { from: null, to: null });
        continue;
      }
      const slugNames = new Map(row.task?.project.workflow.statuses.map((status) => [status.slug, status.name]));
      const hit = nearest(activities.filter((item) => item.taskId === row.taskId), row.createdAt, (item) => item.at);
      const fromSlug = jsonStatus(hit?.fromJson);
      const toSlug = jsonStatus(hit?.toJson);
      names.set(row.id, {
        from: slugNames.get(fromSlug) ?? null,
        to: slugNames.get(toSlug) ?? null,
      });
    }
    return names;
  }

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

  async function handlersFor(rows: { kind: string }[]) {
    const ids = [...new Set(rows.flatMap((row) => {
      const access = parseAccessNotifyKind(row.kind);
      return access?.state === 'handled' ? [access.handlerId] : [];
    }))];
    if (!ids.length) return new Map<string, { id: string; name: string; email: string }>();
    const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
    return new Map(people.map((person) => [person.id, person]));
  }

  async function unreadFor(auth: Awaited<ReturnType<typeof requireAuth>>) {
    return auth.db.notification.count({ where: { userId: auth.userId, readAt: null } });
  }

  app.get('/me/notifications', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const [rows, unreadCount] = await Promise.all([listFor(auth), unreadFor(auth)]);
      const [stages, handlers] = await Promise.all([stagesFor(auth.db, rows), handlersFor(rows)]);
      return {
        items: rows.map((row) => {
          const access = parseAccessNotifyKind(row.kind);
          const handler = access?.state === 'handled' ? handlers.get(access.handlerId) ?? null : null;
          return present(row, stages.get(row.id) ?? { from: null, to: null }, handler);
        }),
        unreadCount,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/me/notifications/read', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const input = z.object({
        id: z.string().optional(),
        ids: z.array(z.string()).optional(),
        all: z.boolean().optional(),
      }).parse(req.body ?? {});
      const ids = [...new Set([...(input.id ? [input.id] : []), ...(input.ids ?? [])])];
      if (!input.all && ids.length === 0) throw validation('Pass id, ids or all.');
      await auth.db.notification.updateMany({
        where: {
          userId: auth.userId,
          readAt: null,
          ...(input.all ? {} : { id: { in: ids } }),
        },
        data: { readAt: new Date() },
      });
      const [rows, unreadCount] = await Promise.all([listFor(auth), unreadFor(auth)]);
      const [stages, handlers] = await Promise.all([stagesFor(auth.db, rows), handlersFor(rows)]);
      return {
        items: rows.map((row) => {
          const access = parseAccessNotifyKind(row.kind);
          const handler = access?.state === 'handled' ? handlers.get(access.handlerId) ?? null : null;
          return present(row, stages.get(row.id) ?? { from: null, to: null }, handler);
        }),
        unreadCount,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
