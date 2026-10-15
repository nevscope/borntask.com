import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../context.js';
import { config } from '../env.js';
import { notFound, sendError, validation } from '../errors.js';
import { actorName, enqueueChat, taskUrl, userName } from '../lib/chatNotify.js';
import { findTaskByKey, loadWorkflow, mapTask, parseTaskKey, taskKey } from '../lib/loadProject.js';
import { nextPosition } from '../lib/mappers.js';
import { moveTask } from '../lib/moveTask.js';

const createTaskSchema = z.object({
  projectKey: z.string(),
  sectionId: z.string(),
  type: z.enum(['idea', 'bug', 'improvement', 'feature']),
  title: z.string().trim().min(1).max(200),
  description: z.string(),
  assigneeId: z.string().nullable(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
  dueDate: z.string().nullable(),
  labels: z.array(z.string()),
  attachmentIds: z.array(z.string()),
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string(),
    type: z.enum(['idea', 'bug', 'improvement', 'feature']),
    assigneeId: z.string().nullable(),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
    dueDate: z.string().nullable(),
    labels: z.array(z.string()),
    sectionId: z.string(),
  })
  .partial();

const TRASH_MS = 30 * 24 * 60 * 60 * 1000;

function trashCutoff(): Date {
  return new Date(Date.now() - TRASH_MS);
}

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:key/tasks', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      const rows = await auth.db.task.findMany({
        where: { projectId: project.id, deletedAt: null, parentId: null },
        include: {
          type: true,
          status: true,
          previousStatus: true,
          section: true,
          project: true,
          labels: { include: { label: true } },
          subtasks: true,
        },
        orderBy: { position: 'asc' },
      });
      return rows.map(mapTask);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/projects/:key/trash', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      const rows = await auth.db.task.findMany({
        where: { projectId: project.id, deletedAt: { gte: trashCutoff() } },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      const deleterIds = [...new Set(rows.map((row) => row.deletedById).filter((id): id is string => Boolean(id)))];
      const people = deleterIds.length ? await prisma.user.findMany({ where: { id: { in: deleterIds } } }) : [];
      const names = new Map(people.map((person) => [person.id, person.name]));
      return rows.map((row) => {
        const deletedAt = row.deletedAt;
        const daysLeft = deletedAt
          ? Math.max(0, Math.ceil((deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
          : null;
        return {
          ...mapTask(row),
          deletedAt: deletedAt ? deletedAt.toISOString() : null,
          deletedByName: row.deletedById ? names.get(row.deletedById) ?? null : null,
          daysLeft,
        };
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/me/tasks', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const include = {
        type: true,
        status: true,
        previousStatus: true,
        section: true,
        project: true,
        labels: { include: { label: true } },
      } as const;
      const assigned = await auth.db.task.findMany({
        where: { assigneeId: auth.userId, deletedAt: null, parentId: null, status: { category: { not: 'done' } } },
        include,
      });
      const created = await auth.db.task.findMany({
        where: { reporterId: auth.userId, deletedAt: null, parentId: null, status: { category: { not: 'done' } } },
        include,
      });
      const watchingRows = await auth.db.taskWatcher.findMany({
        where: { userId: auth.userId },
        include: { task: { include } },
      });
      const watching = watchingRows
        .map((w) => w.task)
        .filter((t) => t && !t.deletedAt && t.status.category !== 'done');

      const myMemberships = await auth.db.projectMember.findMany({
        where: { userId: auth.userId },
        include: { roles: { include: { role: true } } },
      });
      const businessProjectIds = myMemberships
        .filter((m) => m.roles.some((r) => r.role.slug === 'business'))
        .map((m) => m.projectId);
      const approvals = businessProjectIds.length
        ? await auth.db.task.findMany({
            where: {
              projectId: { in: businessProjectIds },
              deletedAt: null,
              status: { slug: 'idea' },
            },
            include,
          })
        : [];

      return {
        assigned: assigned.map(mapTask),
        created: created.map(mapTask),
        watching: watching.map(mapTask),
        approvals: approvals.map(mapTask),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/tasks/:key', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const row = await findTaskByKey(auth.db, key);
      if (!row || (row.deletedAt && row.deletedAt < trashCutoff())) throw notFound();
      const comments = await auth.db.comment.findMany({
        where: { taskId: row.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      const activity = await auth.db.activityLog.findMany({
        where: { taskId: row.id },
        orderBy: { at: 'desc' },
        take: 40,
      });
      const children = await auth.db.task.findMany({ where: { parentId: row.id, deletedAt: null } });
      const watchers = await auth.db.taskWatcher.findMany({ where: { taskId: row.id } });
      return {
        ...mapTask({ ...row, subtasks: children }),
        subtasks: children.map((c) => ({ id: c.id, title: c.title, done: Boolean(c.completedAt) })),
        comments: comments.map((c) => ({
          id: c.id,
          authorId: c.authorId,
          body: c.body,
          via: 'app' as const,
          createdAt: c.createdAt.toISOString(),
        })),
        activity: activity.map((a) => ({
          id: a.id,
          actorId: a.actorId ?? '',
          via: a.via === 'automation' ? 'app' : a.via,
          text: a.action,
          at: a.at.toISOString(),
        })),
        watcherIds: watchers.map((w) => w.userId),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:projectKey/tasks', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const input = createTaskSchema.parse(req.body);
      const project = await auth.db.project.findFirst({ where: { key: input.projectKey } });
      if (!project) throw notFound();
      const type = await auth.db.taskType.findFirst({ where: { slug: input.type } });
      if (!type) throw validation('Unknown type.');
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      const wf = await loadWorkflow(auth.db, project.workflowId);
      const startSlug = input.type === 'bug' ? (ws?.bugsStartIn === 'idea' ? 'idea' : 'approved') : 'idea';
      const statusId = wf.statusIdBySlug[startSlug] ?? wf.statusIdBySlug.todo ?? Object.values(wf.statusIdBySlug)[0];
      if (!statusId) throw validation('Workflow has no start status.');
      const last = await auth.db.task.findFirst({
        where: { projectId: project.id },
        orderBy: { number: 'desc' },
      });
      const lastInSection = await auth.db.task.findFirst({
        where: { sectionId: input.sectionId, deletedAt: null },
        orderBy: { position: 'desc' },
      });
      const created = await auth.db.task.create({
        data: {
          tenantId: auth.tenantId,
          projectId: project.id,
          number: (last?.number ?? 0) + 1,
          title: input.title,
          description: input.description,
          typeId: type.id,
          statusId,
          sectionId: input.sectionId,
          assigneeId: input.assigneeId,
          reporterId: auth.userId,
          priority: input.priority,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          position: nextPosition(lastInSection?.position ?? null),
        },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      await auth.db.activityLog.create({
        data: {
          tenantId: auth.tenantId,
          taskId: created.id,
          actorId: auth.userId,
          actorType: auth.actorType,
          via: auth.via,
          action: `created this ${input.type}`,
        },
      });
      const createdKey = taskKey(created.project.key, created.number);
      const name = await actorName(auth.userId);
      const url = taskUrl(created.project.key, createdKey);
      if (input.type === 'idea') {
        await enqueueChat(auth, {
          projectId: created.projectId,
          event: 'new_idea',
          title: created.title,
          taskKey: createdKey,
          projectName: created.project.name,
          text: `${name} raised an idea.`,
          url,
        });
      }
      if (created.assigneeId) {
        const assignee = await userName(created.assigneeId);
        await enqueueChat(auth, {
          projectId: created.projectId,
          event: 'assigned',
          title: created.title,
          taskKey: createdKey,
          projectName: created.project.name,
          text: assignee ? `${name} assigned it to ${assignee}.` : `${name} assigned it.`,
          url,
        });
      }
      return mapTask(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/tasks/:key', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const input = updateTaskSchema.parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row || row.deletedAt) throw notFound();
      let typeId: string | undefined;
      if (input.type) {
        const type = await auth.db.taskType.findFirst({ where: { slug: input.type } });
        if (!type) throw validation('Unknown type.');
        typeId = type.id;
      }
      const updated = await auth.db.task.update({
        where: { id: row.id },
        data: {
          title: input.title,
          description: input.description,
          typeId,
          assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
          priority: input.priority,
          dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
          sectionId: input.sectionId,
        },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      if (auth.via === 'mcp') {
        await auth.db.activityLog.create({
          data: {
            tenantId: auth.tenantId,
            taskId: row.id,
            actorId: auth.userId,
            actorType: 'mcp',
            via: 'mcp',
            action: 'updated this task',
          },
        });
      }
      if (input.assigneeId && input.assigneeId !== row.assigneeId) {
        const name = await actorName(auth.userId);
        const assignee = await userName(input.assigneeId);
        const updatedKey = taskKey(updated.project.key, updated.number);
        await enqueueChat(auth, {
          projectId: updated.projectId,
          event: 'assigned',
          title: updated.title,
          taskKey: updatedKey,
          projectName: updated.project.name,
          text: assignee ? `${name} assigned it to ${assignee}.` : `${name} assigned it.`,
          url: taskUrl(updated.project.key, updatedKey),
        });
      }
      return mapTask(updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/move', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const input = z
        .object({
          toStatusId: z.string(),
          comment: z.string().optional(),
          overrideReason: z.string().optional(),
          undo: z.boolean().optional(),
        })
        .parse(req.body);
      return await moveTask(auth, key, input);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/reorder', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const input = z.object({ sectionId: z.string(), beforeKey: z.string().nullable() }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row || row.deletedAt) throw notFound();
      const siblings = await auth.db.task.findMany({
        where: { sectionId: input.sectionId, deletedAt: null, parentId: null },
        include: { project: true },
        orderBy: { position: 'asc' },
      });
      const moving = siblings.filter((s) => s.id !== row.id);
      const before = input.beforeKey ? parseTaskKey(input.beforeKey) : null;
      const beforeRow = before
        ? moving.find((s) => s.project.key === before.projectKey && s.number === before.number)
        : undefined;
      const next = beforeRow
        ? [...moving.slice(0, moving.indexOf(beforeRow)), row, ...moving.slice(moving.indexOf(beforeRow))]
        : [...moving, row];
      for (let i = 0; i < next.length; i++) {
        await auth.db.task.update({
          where: { id: next[i]!.id },
          data: { sectionId: input.sectionId, position: `a${String(i).padStart(4, '0')}` },
        });
      }
      const fresh = await findTaskByKey(auth.db, key);
      if (!fresh) throw notFound();
      return mapTask(fresh);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/comments', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ body: z.string().trim().min(1) }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      const c = await auth.db.comment.create({
        data: { tenantId: auth.tenantId, taskId: row.id, authorId: auth.userId, body: body.body },
      });
      if (auth.via === 'mcp') {
        await auth.db.activityLog.create({
          data: {
            tenantId: auth.tenantId,
            taskId: row.id,
            actorId: auth.userId,
            actorType: 'mcp',
            via: 'mcp',
            action: 'commented',
          },
        });
      }
      if (body.body.includes('@')) {
        const name = await actorName(auth.userId);
        const commentKey = taskKey(row.project.key, row.number);
        await enqueueChat(auth, {
          projectId: row.projectId,
          event: 'mention',
          title: row.title,
          taskKey: commentKey,
          projectName: row.project.name,
          text: `${name} mentioned someone in a comment.`,
          url: taskUrl(row.project.key, commentKey),
        });
      }
      return { id: c.id, authorId: c.authorId, body: c.body, via: auth.via, createdAt: c.createdAt.toISOString() };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/subtasks', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ title: z.string().trim().min(1) }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      const last = await auth.db.task.findFirst({ where: { projectId: row.projectId }, orderBy: { number: 'desc' } });
      const child = await auth.db.task.create({
        data: {
          tenantId: auth.tenantId,
          projectId: row.projectId,
          number: (last?.number ?? 0) + 1,
          title: body.title,
          typeId: row.typeId,
          statusId: row.statusId,
          sectionId: row.sectionId,
          reporterId: auth.userId,
          parentId: row.id,
          position: nextPosition(null),
        },
      });
      return { id: child.id, title: child.title, done: false };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/tasks/:key/subtasks/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { id } = req.params as { id: string };
      const body = z.object({ done: z.boolean() }).parse(req.body);
      const child = await auth.db.task.update({
        where: { id },
        data: { completedAt: body.done ? new Date() : null },
      });
      return { id: child.id, title: child.title, done: Boolean(child.completedAt) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/tasks/:key', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      await auth.db.task.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), deletedById: auth.userId },
      });
      await auth.db.activityLog.create({
        data: { tenantId: auth.tenantId, taskId: row.id, actorId: auth.userId, via: 'app', action: 'moved to Trash' },
      });
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/restore', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const parsed = parseTaskKey(key);
      if (!parsed) throw notFound();
      const project = await auth.db.project.findFirst({ where: { key: parsed.projectKey } });
      if (!project) throw notFound();
      const row = await auth.db.task.findFirst({
        where: { projectId: project.id, number: parsed.number },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      if (!row) throw notFound();
      const updated = await auth.db.task.update({
        where: { id: row.id },
        data: { deletedAt: null, deletedById: null },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      return mapTask(updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/watchers', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ userId: z.string().optional(), watch: z.boolean().default(true) }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      const userId = body.userId ?? auth.userId;
      if (body.watch) {
        await auth.db.taskWatcher.upsert({
          where: { taskId_userId: { taskId: row.id, userId } },
          update: {},
          create: { tenantId: auth.tenantId, taskId: row.id, userId },
        });
      } else {
        await auth.db.taskWatcher.deleteMany({ where: { taskId: row.id, userId } });
      }
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/uploads', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const file = await req.file();
      if (!file) throw validation('No file.');
      const buf = await file.toBuffer();
      if (buf.length > 25 * 1024 * 1024) throw validation('Files must be 25 MB or smaller.');
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const dir = join(config.blobRoot, auth.tenantId);
      await mkdir(dir, { recursive: true });
      const storageKey = `${auth.tenantId}/${id}-${file.filename}`;
      await writeFile(join(config.blobRoot, storageKey), buf);
      const taskId = (req.query as { taskId?: string }).taskId;
      if (taskId) {
        const att = await auth.db.attachment.create({
          data: { tenantId: auth.tenantId, taskId, storageKey, name: file.filename, size: buf.length, mime: file.mimetype },
        });
        return { id: att.id, name: att.name, size: att.size };
      }
      return { id, name: file.filename, size: buf.length, storageKey };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
