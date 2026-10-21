import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isTaskDescriptionTooLong, suggestedBranchName, TASK_DESCRIPTION_TOO_LONG, taskDescriptionSchema } from '@borntask/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../context.js';
import { forbidden, notFound, sendError, validation } from '../errors.js';
import { actorName, enqueueChat, enqueuePersonalChat, mentionUserIds, taskUrl, userName, workspacePeople } from '../lib/chatNotify.js';
import { badgesForTasks } from '../lib/githubBadge.js';
import { findTaskByKey, loadWorkflow, mapTask, parseTaskKey, taskKey } from '../lib/loadProject.js';
import { nextPosition } from '../lib/mappers.js';
import { persistDescription } from '../lib/descriptionHtml.js';
import { moveTask } from '../lib/moveTask.js';
import { publishTaskChange } from '../lib/live.js';
import {
  attachPendingToTask,
  mapAttachment,
  openAttachmentFile,
  removeAttachmentFile,
  storePendingUpload,
  storeTaskUpload,
} from '../lib/attachments.js';
import { requireOpenProject } from '../lib/projectAccess.js';

const createTaskSchema = z.object({
  projectKey: z.string(),
  sectionId: z.string(),
  type: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: taskDescriptionSchema,
  assigneeId: z.string().nullable(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
  dueDate: z.string().nullable(),
  labels: z.array(z.string()),
  attachmentIds: z.array(z.string()),
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: taskDescriptionSchema,
    type: z.string().min(1),
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
      const project = await requireOpenProject(auth, key);
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
      const badges = await badgesForTasks(auth.db, rows.map((row) => row.id));
      return rows.map((row) => ({ ...mapTask(row), githubBadge: badges.get(row.id) ?? null }));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/projects/:key/trash', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await requireOpenProject(auth, key);
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
      const badges = await badgesForTasks(auth.db, [row.id]);
      const repoCount = await auth.db.projectRepo.count({ where: { projectId: row.projectId } });
      const ghSettings = await auth.db.projectGithubSettings.findFirst({ where: { projectId: row.projectId } });
      const links = await auth.db.devLink.findMany({ where: { taskId: row.id }, orderBy: { kind: 'asc' } });
      const branch = suggestedBranchName(
        ghSettings?.branchTemplate ?? '{type}/{key}-{title}',
        row.type.slug,
        taskKey(row.project.key, row.number),
        row.title,
      );
      const ghActivity = activity.filter((a) => a.via === 'github').slice(0, 8);
      const attachments = await auth.db.attachment.findMany({ where: { taskId: row.id }, orderBy: { createdAt: 'asc' } });
      const mappedKey = taskKey(row.project.key, row.number);
      return {
        ...mapTask({ ...row, subtasks: children }),
        githubBadge: badges.get(row.id) ?? null,
        development: {
          enabled: repoCount > 0,
          suggestedBranch: branch,
          gitCheckout: `git checkout -b ${branch}`,
          links: links.map((link) => ({
            id: link.id,
            kind: link.kind,
            title: link.extra || (link.kind === 'pr' ? `#${link.ref}` : link.ref),
            url: link.url,
            repo: link.repoFullName.split('/')[1] ?? link.repoFullName,
            author: link.authorLogin ?? '',
            prState: link.prState,
            checks: link.checks,
            extra: link.extra ?? '',
          })),
          githubActivity: ghActivity.map((a) => ({ when: a.at.toISOString(), text: a.action })),
        },
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
          via: a.via,
          text: a.action,
          at: a.at.toISOString(),
        })),
        watcherIds: watchers.map((w) => w.userId),
        attachments: attachments.map((att) => mapAttachment(mappedKey, att)),
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
          description: (() => {
            const description = persistDescription(input.description);
            if (isTaskDescriptionTooLong(description)) throw validation(TASK_DESCRIPTION_TOO_LONG);
            return description;
          })(),
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
      await attachPendingToTask(auth, created.id, input.attachmentIds);
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
      const mappedCreated = mapTask(created);
      publishTaskChange(auth, mappedCreated, 'create');
      if (created.assigneeId) {
        const assignee = await userName(created.assigneeId);
        const assignedJob = {
          projectId: created.projectId,
          event: 'assigned' as const,
          title: created.title,
          taskKey: createdKey,
          projectName: created.project.name,
          text: assignee ? `${name} assigned it to ${assignee}.` : `${name} assigned it.`,
          url,
        };
        await enqueueChat(auth, assignedJob);
        await enqueuePersonalChat(auth, created.assigneeId, assignedJob);
      }
      return mappedCreated;
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
          description: input.description === undefined ? undefined : (() => {
            const description = persistDescription(input.description);
            if (isTaskDescriptionTooLong(description)) throw validation(TASK_DESCRIPTION_TOO_LONG);
            return description;
          })(),
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
      const mappedUpdated = mapTask(updated);
      publishTaskChange(auth, mappedUpdated, 'patch');
      if (input.assigneeId && input.assigneeId !== row.assigneeId) {
        const name = await actorName(auth.userId);
        const assignee = await userName(input.assigneeId);
        const updatedKey = taskKey(updated.project.key, updated.number);
        const assignedJob = {
          projectId: updated.projectId,
          event: 'assigned' as const,
          title: updated.title,
          taskKey: updatedKey,
          projectName: updated.project.name,
          text: assignee ? `${name} assigned it to ${assignee}.` : `${name} assigned it.`,
          url: taskUrl(updated.project.key, updatedKey),
        };
        await enqueueChat(auth, assignedJob);
        await enqueuePersonalChat(auth, input.assigneeId, assignedJob);
      }
      return mappedUpdated;
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

  app.post('/tasks/:key/github/start-work', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.via === 'mcp') throw forbidden('MCP cannot change GitHub settings.');
      const key = (req.params as { key: string }).key;
      const input = z.object({ assignAndMove: z.boolean() }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row || row.deletedAt) throw notFound();
      if (input.assignAndMove) {
        await auth.db.task.update({ where: { id: row.id }, data: { assigneeId: auth.userId } });
        try {
          await moveTask(auth, key, { toStatusId: 'wip' });
        } catch {
          publishTaskChange(auth, { key, projectKey: row.project.key }, 'patch');
        }
      }
      return { ok: true };
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
      const mapped = mapTask(fresh);
      publishTaskChange(auth, mapped, 'reorder');
      return mapped;
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
      const name = await actorName(auth.userId);
      const commentKey = taskKey(row.project.key, row.number);
      const commentUrl = taskUrl(row.project.key, commentKey);
      if (body.body.includes('@')) {
        const mentionJob = {
          projectId: row.projectId,
          event: 'mention' as const,
          title: row.title,
          taskKey: commentKey,
          projectName: row.project.name,
          text: `${name} mentioned someone in a comment.`,
          url: commentUrl,
        };
        await enqueueChat(auth, mentionJob);
        const people = await workspacePeople(auth);
        for (const userId of mentionUserIds(body.body, people)) {
          await enqueuePersonalChat(auth, userId, mentionJob);
        }
      }
      const watchers = await auth.db.taskWatcher.findMany({ where: { taskId: row.id } });
      const commentJob = {
        projectId: row.projectId,
        event: 'watch_comment' as const,
        title: row.title,
        taskKey: commentKey,
        projectName: row.project.name,
        text: `${name} commented.`,
        url: commentUrl,
      };
      for (const watcher of watchers) {
        await enqueuePersonalChat(auth, watcher.userId, commentJob);
      }
      publishTaskChange(auth, { key: commentKey, projectKey: row.project.key }, 'comment');
      return { id: c.id, authorId: c.authorId, body: c.body, via: auth.via, createdAt: c.createdAt.toISOString() };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/tasks/:key/comments/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const body = z.object({ body: z.string().trim().min(1) }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      const c = await auth.db.comment.findFirst({ where: { id, taskId: row.id, deletedAt: null } });
      if (!c) throw notFound('Comment not found.');
      if (c.authorId !== auth.userId) throw forbidden('You can only edit your own comments.');
      const next = await auth.db.comment.update({ where: { id: c.id }, data: { body: body.body } });
      publishTaskChange(auth, { key: taskKey(row.project.key, row.number), projectKey: row.project.key }, 'comment');
      return { id: next.id, authorId: next.authorId, body: next.body, via: auth.via, createdAt: next.createdAt.toISOString() };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/tasks/:key/comments/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      const c = await auth.db.comment.findFirst({ where: { id, taskId: row.id, deletedAt: null } });
      if (!c) throw notFound('Comment not found.');
      const canDelete = c.authorId === auth.userId || auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin';
      if (!canDelete) throw forbidden('You cannot delete this comment.');
      await auth.db.comment.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
      publishTaskChange(auth, { key: taskKey(row.project.key, row.number), projectKey: row.project.key }, 'comment');
      return reply.status(204).send();
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
      publishTaskChange(auth, { key, projectKey: row.project.key }, 'patch');
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
      const parentKey = (req.params as { key: string }).key;
      const parent = await findTaskByKey(auth.db, parentKey);
      if (parent) publishTaskChange(auth, { key: parentKey, projectKey: parent.project.key }, 'patch');
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
      publishTaskChange(auth, { key, projectKey: row.project.key }, 'delete');
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
      const mapped = mapTask(updated);
      publishTaskChange(auth, mapped, 'restore');
      return mapped;
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

  app.get('/tasks/:key/attachments', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const row = await findTaskByKey(auth.db, key);
      if (!row || row.deletedAt) throw notFound();
      const attachments = await auth.db.attachment.findMany({ where: { taskId: row.id }, orderBy: { createdAt: 'asc' } });
      return attachments.map((att) => mapAttachment(key, att));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/attachments', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const row = await findTaskByKey(auth.db, key);
      if (!row || row.deletedAt) throw notFound();
      const file = await req.file();
      if (!file) throw validation('No file.');
      const buf = await file.toBuffer();
      const att = await storeTaskUpload(auth, row.id, {
        filename: file.filename,
        mimetype: file.mimetype,
        buffer: buf,
      });
      return mapAttachment(key, att);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/tasks/:key/attachments/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      const att = await auth.db.attachment.findFirst({ where: { id, taskId: row.id } });
      if (!att) throw notFound();
      const stream = await openAttachmentFile(auth.tenantId, att.storageKey);
      return reply
        .header('Content-Type', att.mime || 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${att.name.replace(/"/g, '')}"`)
        .send(stream);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/tasks/:key/attachments/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const row = await findTaskByKey(auth.db, key);
      if (!row || row.deletedAt) throw notFound();
      const att = await auth.db.attachment.findFirst({ where: { id, taskId: row.id } });
      if (!att) throw notFound();
      await removeAttachmentFile(auth.tenantId, att.storageKey);
      await auth.db.attachment.delete({ where: { id: att.id } });
      return reply.code(204).send();
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
      return storePendingUpload(auth.tenantId, {
        filename: file.filename,
        mimetype: file.mimetype,
        buffer: buf,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
