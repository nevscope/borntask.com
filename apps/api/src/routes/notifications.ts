import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { sendError, validation } from '../errors.js';

const kindSchema = z.enum(['mention', 'assigned', 'moved', 'invite', 'github']);

function textFor(kind: string, title: string | null, key: string | null) {
  const label = title ?? key ?? 'a task';
  if (kind === 'mention') return `Someone mentioned you on ${label}`;
  if (kind === 'assigned') return `You were assigned ${label}`;
  if (kind === 'moved') return `${label} moved stage`;
  if (kind === 'invite') return 'Someone accepted an invitation';
  if (kind === 'github') return `A linked pull request updated ${key ?? label}`;
  return label;
}

function present(
  row: {
    id: string;
    kind: string;
    readAt: Date | null;
    createdAt: Date;
    task: { key: string; title: string; project: { key: string } } | null;
  },
) {
  const parsed = kindSchema.safeParse(row.kind);
  const kind = parsed.success ? parsed.data : 'moved';
  return {
    id: row.id,
    kind,
    text: textFor(row.kind, row.task?.title ?? null, row.task?.key ?? null),
    taskKey: row.task?.key ?? null,
    projectKey: row.task?.project.key ?? null,
    actor: null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  const include = { task: { select: { key: true, title: true, project: { select: { key: true } } } } } as const;

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
