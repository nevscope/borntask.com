import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { sendError, validation } from '../errors.js';
import { taskKey } from '../lib/loadProject.js';

const kindSchema = z.enum(['mention', 'assigned', 'moved', 'invite', 'github', 'access_request']);

function projectInviteKey(kind: string): string | null {
  return kind.startsWith('project_invite:') ? kind.slice('project_invite:'.length) || null : null;
}

function accessRequestKey(kind: string): string | null {
  return kind.startsWith('access_request:') ? kind.slice('access_request:'.length) || null : null;
}

function textFor(kind: string, title: string | null, key: string | null) {
  const invited = projectInviteKey(kind);
  if (invited) return `You were invited to ${invited}`;
  const requested = accessRequestKey(kind);
  if (requested) return `Someone asked to open ${requested}`;
  const label = title ?? key ?? 'a task';
  if (kind === 'mention') return `Someone mentioned you on ${label}`;
  if (kind === 'assigned') return `You were assigned ${label}`;
  if (kind === 'moved') return `${label} moved stage`;
  if (kind === 'watched_comment') return `Someone commented on ${label}`;
  if (kind === 'invite') return 'Someone accepted an invitation';
  if (kind === 'github') return `A linked pull request updated ${key ?? label}`;
  if (kind === 'access_granted') return 'You can now open the project you asked for.';
  if (kind === 'access_declined') return 'Your request to open a project was declined.';
  if (kind === 'access_request') return 'Someone asked to open a project.';
  return label;
}

function present(
  row: {
    id: string;
    kind: string;
    readAt: Date | null;
    createdAt: Date;
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
    text: textFor(row.kind, row.task?.title ?? null, key),
    taskKey: key,
    projectKey: invited ?? requested ?? row.task?.project.key ?? null,
    needsAccept: Boolean(invited),
    actor: null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  const include = { task: { select: { number: true, title: true, project: { select: { key: true } } } } } as const;

  app.get('/me/notifications', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const rows = await auth.db.notification.findMany({
        where: { userId: auth.userId },
        include,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const items = rows.map(present);
      return { items, unreadCount: items.filter((n) => !n.readAt).length };
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
      const rows = await auth.db.notification.findMany({
        where: { userId: auth.userId },
        include,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const items = rows.map(present);
      return { items, unreadCount: items.filter((n) => !n.readAt).length };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
