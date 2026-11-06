import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { COMMENT_REACTION_KINDS, createTaskStartSlug, isTaskDescriptionTooLong, planningTypeAllowed, suggestedBranchName, TASK_DESCRIPTION_TOO_LONG, taskDescriptionSchema } from '@borntask/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../context.js';
import { forbidden, notFound, sendError, validation } from '../errors.js';
import { actorName, enqueueChat, enqueuePersonalChat, taskUrl, userName } from '../lib/chatNotify.js';
import { badgesForTasks } from '../lib/githubBadge.js';
import { findTaskByKey, loadWorkflow, mapTask, parseTaskKey, planningMetaForProject, taskKey } from '../lib/loadProject.js';
import { blockedTaskIds, createTaskLink, listTaskLinks, removeTaskLink } from '../lib/taskLinks.js';
import { resolvePlanningParent } from '../lib/planning.js';
import { mapUsers, nextPosition } from '../lib/mappers.js';
import { persistDescription } from '../lib/descriptionHtml.js';
import { enqueueTaskEventEmail } from '../lib/enqueueTaskEmail.js';
import { moveTask } from '../lib/moveTask.js';
import { moveTaskToProject } from '../lib/moveTaskToProject.js';
import { publishTaskChange } from '../lib/live.js';
import { notifyInApp } from '../lib/notifyInApp.js';
import { mapComment, postComment } from '../lib/postComment.js';
import {
  attachPendingToTask,
  mapAttachment,
  openAttachmentFile,
  removeAttachmentFile,
  storePendingUpload,
  storeTaskUpload,
} from '../lib/attachments.js';
import { canOpenListed, openProjectIds, requireOpenProject, requireOpenProjectWrite, requireProjectWrite } from '../lib/projectAccess.js';
import { setTaskLabels } from '../lib/setTaskLabels.js';
import { setTaskCustomFields } from '../lib/customFields.js';
import { convertTaskToSubtask, promoteSubtask } from '../lib/convertTaskNesting.js';
import { resolveReleaseId } from '../lib/releases.js';

function mapSubtask(row: {
  id: string;
  title: string;
  completedAt: Date | null;
  assigneeId: string | null;
  dueDate: Date | null;
}) {
  return {
    id: row.id,
    title: row.title,
    done: Boolean(row.completedAt),
    assigneeId: row.assigneeId,
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
  };
}

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
  planningParentId: z.string().nullable().optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: taskDescriptionSchema,
    type: z.string().min(1),
    assigneeId: z.string().nullable(),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
    dueDate: z.string().nullable(),
    estimate: z.string().trim().max(40).nullable(),
    labels: z.array(z.string()),
    sectionId: z.string(),
    planningParentId: z.string().nullable(),
    releaseId: z.string().nullable(),
    customFields: z.array(z.object({
      fieldId: z.string(),
      value: z.string().nullable(),
    })),
  })
  .partial();

const TRASH_MS = 30 * 24 * 60 * 60 * 1000;

function trashCutoff(): Date {
  return new Date(Date.now() - TRASH_MS);
}

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workspace/tasks', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const openIds = await openProjectIds(auth);
      if (openIds && openIds.size === 0) {
        return { tasks: [], users: [], statuses: [], sections: [], labels: [] };
      }
      const rows = await auth.db.task.findMany({
        where: {
          deletedAt: null,
          parentId: null,
          ...(openIds ? { projectId: { in: [...openIds] } } : {}),
        },
        include: {
          type: true,
          status: true,
          previousStatus: true,
          section: true,
          project: true,
          labels: { include: { label: true } },
          release: true,
          customFieldValues: true,
          subtasks: { where: { deletedAt: null } },
          attachments: { select: { id: true } },
          comments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { comments: { where: { deletedAt: null } }, attachments: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 2500,
      });
      const userIds = [...new Set(rows.flatMap((row) => [row.assigneeId, row.reporterId].filter((id): id is string => Boolean(id))))];
      const people = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } } }) : [];
      const statusSeen = new Map<string, { id: string; name: string; category: 'backlog' | 'active' | 'review' | 'done' }>();
      const sectionSeen = new Map<string, { id: string; name: string; hidden?: boolean }>();
      const labels = new Set<string>();
      const tasks = rows.map((row) => {
        const category = row.status.category;
        const safeCategory = category === 'backlog' || category === 'active' || category === 'review' || category === 'done' ? category : 'active';
        statusSeen.set(row.status.slug, { id: row.status.slug, name: row.status.name, category: safeCategory });
        sectionSeen.set(row.sectionId, { id: row.sectionId, name: row.section?.name ?? 'No section', hidden: row.section?.hidden ?? undefined });
        for (const tag of row.labels) labels.add(tag.label.name);
        return {
          ...mapTask(row),
          statusName: row.status.name,
          statusCategory: safeCategory,
        };
      });
      return {
        tasks,
        users: mapUsers(people),
        statuses: [...statusSeen.values()],
        sections: [...sectionSeen.values()],
        labels: [...labels].sort((a, b) => a.localeCompare(b, 'en-GB')),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

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
          release: true,
          customFieldValues: true,
          subtasks: { where: { deletedAt: null } },
          attachments: { select: { id: true } },
          comments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { comments: { where: { deletedAt: null } }, attachments: true } },
        },
        orderBy: { position: 'asc' },
      });
      const badges = await badgesForTasks(auth.db, rows.map((row) => row.id));
      const planning = await planningMetaForProject(auth.db, project.id);
      const blocked = await blockedTaskIds(auth.db, rows.map((row) => row.id));
      return rows.map((row) => ({
        ...mapTask(row, planning.get(row.id)),
        githubBadge: badges.get(row.id) ?? null,
        isBlocked: blocked.has(row.id),
      }));
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
        release: true,
        customFieldValues: true,
        attachments: { select: { id: true } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { comments: { where: { deletedAt: null } }, attachments: true } },
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
      const unassigned = await auth.db.task.findMany({
        where: { assigneeId: null, deletedAt: null, parentId: null, status: { category: { not: 'done' } } },
        include,
      });

      const myMemberships = await auth.db.projectMember.findMany({
        where: { userId: auth.userId },
        include: { roles: { include: { role: true } } },
      });
      const openIds = await openProjectIds(auth);
      const businessProjectIds = myMemberships
        .filter((m) => m.roles.some((r) => r.role.slug === 'business') && canOpenListed(openIds, m.projectId))
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

      const visible = <T extends { projectId: string }>(rows: T[]) =>
        rows.filter((row) => canOpenListed(openIds, row.projectId));
      const assignedOpen = visible(assigned);
      const createdOpen = visible(created);
      const watchingOpen = visible(watching);
      const unassignedOpen = visible(unassigned);
      const blocked = await blockedTaskIds(auth.db, [...assignedOpen, ...createdOpen, ...watchingOpen, ...unassignedOpen, ...approvals].map((row) => row.id));
      const mark = (row: typeof assigned[number]) => ({ ...mapTask(row), isBlocked: blocked.has(row.id) });

      return {
        assigned: assignedOpen.map(mark),
        created: createdOpen.map(mark),
        watching: watchingOpen.map(mark),
        unassigned: unassignedOpen.map(mark),
        approvals: approvals.map(mark),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/tasks/:key', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      let row = await findTaskByKey(auth.db, key);
      let redirectedFrom: string | null = null;
      if (row?.parentId && !row.deletedAt) {
        const parentRef = await auth.db.task.findFirst({
          where: { id: row.parentId, deletedAt: null },
          include: { project: true },
        });
        if (!parentRef) throw notFound();
        const parent = await findTaskByKey(auth.db, taskKey(parentRef.project.key, parentRef.number));
        if (!parent || parent.deletedAt) throw notFound();
        redirectedFrom = key;
        row = parent;
      }
      if (!row || (row.deletedAt && row.deletedAt < trashCutoff())) throw notFound();
      await requireOpenProject(auth, row.project.key);
      const comments = await auth.db.comment.findMany({
        where: { taskId: row.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { reactions: true },
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
      const planning = await planningMetaForProject(auth.db, row.projectId);
      const planningKids = await auth.db.task.findMany({
        where: { planningParentId: row.id, deletedAt: null, parentId: null },
        include: { type: true, project: true },
        orderBy: { position: 'asc' },
      });
      const openIds = await openProjectIds(auth);
      const taskLinks = await listTaskLinks(auth.db, row.id, (projectId) => canOpenListed(openIds, projectId));
      const blocked = await blockedTaskIds(auth.db, [row.id]);
      return {
        ...mapTask({ ...row, subtasks: children }, planning.get(row.id)),
        isBlocked: blocked.has(row.id),
        links: taskLinks,
        githubBadge: badges.get(row.id) ?? null,
        planningChildren: planningKids.map((kid) => ({
          key: taskKey(kid.project.key, kid.number),
          title: kid.title,
          type: kid.type.slug,
        })),
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
        subtasks: children.map(mapSubtask),
        comments: comments.map((c) => mapComment(c, c.reactions, comments)),
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
        redirectedFrom,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/links', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const input = z.object({
        type: z.string(),
        otherKey: z.string().trim().min(1),
      }).parse(req.body);
      return await createTaskLink(auth, key, input.type, input.otherKey);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/tasks/:key/links/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      await removeTaskLink(auth, key, id);
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:projectKey/tasks', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const input = createTaskSchema.parse(req.body);
      const project = await requireOpenProjectWrite(auth, input.projectKey);
      const type = await auth.db.taskType.findFirst({ where: { slug: input.type } });
      if (!type) throw validation('Unknown type.');
      if (project.disabledTypes.split(',').map((slug) => slug.trim()).includes(input.type)) {
        throw validation('This project does not use that task type.');
      }
      if (!planningTypeAllowed(project.workBreakdown, input.type)) {
        throw validation('Turn on work breakdown for this project to use that type.');
      }
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      const wf = await loadWorkflow(auth.db, project.workflowId);
      const startSlug = createTaskStartSlug(input.type, ws?.bugsStartIn, project.storiesNeedApproval);
      const planningParentId = await resolvePlanningParent(auth.db, project, input.type, input.planningParentId);
      const statusId = wf.statusIdBySlug[startSlug] ?? wf.statusIdBySlug.todo ?? Object.values(wf.statusIdBySlug)[0];
      if (!statusId) throw validation('Workflow has no start status.');
      const last = await auth.db.task.findFirst({
        where: { projectId: project.id },
        orderBy: { number: 'desc' },
      });
      const lastInSection = await auth.db.task.findFirst({
        where: { sectionId: input.sectionId, deletedAt: null, parentId: null },
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
          planningParentId,
        },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      await attachPendingToTask(auth, created.id, input.attachmentIds);
      if (input.labels.length) {
        await setTaskLabels(auth.db, {
          tenantId: auth.tenantId,
          projectId: created.projectId,
          taskId: created.id,
          names: input.labels,
        });
      }
      const afterAttach = input.attachmentIds.length || input.labels.length
        ? await findTaskByKey(auth.db, taskKey(created.project.key, created.number))
        : null;
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
      const createdPlanning = await planningMetaForProject(auth.db, created.projectId);
      const mappedCreated = mapTask(afterAttach ?? created, createdPlanning.get(created.id));
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
        await notifyInApp(auth, created.assigneeId, 'assigned', { kind: 'assigned', taskId: created.id });
        await enqueuePersonalChat(auth, created.assigneeId, assignedJob);
        await enqueueTaskEventEmail(auth, created.assigneeId, 'assigned', {
          taskId: created.id,
          taskKey: createdKey,
          title: created.title,
          projectName: created.project.name,
          statusName: created.status.name,
          actorName: name,
          eventLabel: 'assigned you',
          url,
        });
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
      await requireOpenProjectWrite(auth, row.project.key);
      let typeId: string | undefined;
      if (input.type) {
        const type = await auth.db.taskType.findFirst({ where: { slug: input.type } });
        if (!type) throw validation('Unknown type.');
        if (row.project.disabledTypes.split(',').map((slug) => slug.trim()).includes(input.type)) {
          throw validation('This project does not use that task type.');
        }
        if (!planningTypeAllowed(row.project.workBreakdown, input.type)) {
          throw validation('Turn on work breakdown for this project to use that type.');
        }
        typeId = type.id;
      }
      const nextSlug = input.type ?? row.type.slug;
      const planningParentId = input.planningParentId === undefined
        ? undefined
        : await resolvePlanningParent(auth.db, row.project, nextSlug, input.planningParentId, row.id);
      const releaseId = await resolveReleaseId(auth, input.releaseId);
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
          estimate: input.estimate === undefined ? undefined : input.estimate?.trim() || null,
          sectionId: input.sectionId,
          planningParentId,
          releaseId,
        },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      if (input.labels) {
        await setTaskLabels(auth.db, {
          tenantId: auth.tenantId,
          projectId: row.projectId,
          taskId: row.id,
          names: input.labels,
        });
      }
      if (input.customFields) {
        await setTaskCustomFields(auth.db, {
          tenantId: auth.tenantId,
          projectId: row.projectId,
          taskId: row.id,
          taskType: nextSlug,
          values: input.customFields,
        });
      }
      const labelled = await findTaskByKey(auth.db, key);
      if (!labelled) throw notFound();
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
      const mappedUpdated = mapTask(labelled);
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
        await notifyInApp(auth, input.assigneeId, 'assigned', { kind: 'assigned', taskId: updated.id });
        await enqueuePersonalChat(auth, input.assigneeId, assignedJob);
        await enqueueTaskEventEmail(auth, input.assigneeId, 'assigned', {
          taskId: updated.id,
          taskKey: updatedKey,
          title: updated.title,
          projectName: updated.project.name,
          statusName: updated.status.name,
          actorName: name,
          eventLabel: 'assigned you',
          url: assignedJob.url,
        });
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

  app.post('/tasks/:key/move-project', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const input = z.object({
        projectKey: z.string().min(1),
        sectionId: z.string().optional(),
      }).parse(req.body);
      return await moveTaskToProject(auth, key, input);
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
      await requireOpenProjectWrite(auth, row.project.key);
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
      await requireOpenProjectWrite(auth, row.project.key);
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

  app.post('/tasks/:key/copy', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const source = await findTaskByKey(auth.db, key);
      if (!source || source.deletedAt) throw notFound();
      await requireOpenProjectWrite(auth, source.project.key);
      const last = await auth.db.task.findFirst({
        where: { projectId: source.projectId },
        orderBy: { number: 'desc' },
      });
      const lastInSection = await auth.db.task.findFirst({
        where: { sectionId: source.sectionId, deletedAt: null, parentId: null },
        orderBy: { position: 'desc' },
      });
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      const wf = await loadWorkflow(auth.db, source.project.workflowId);
      const startSlug = createTaskStartSlug(source.type.slug, ws?.bugsStartIn, source.project.storiesNeedApproval);
      const statusId = wf.statusIdBySlug[startSlug] ?? wf.statusIdBySlug.todo ?? Object.values(wf.statusIdBySlug)[0];
      if (!statusId) throw validation('Workflow has no start status.');
      const created = await auth.db.task.create({
        data: {
          tenantId: auth.tenantId,
          projectId: source.projectId,
          number: (last?.number ?? 0) + 1,
          title: `Copy of ${source.title}`.slice(0, 200),
          description: source.description,
          typeId: source.typeId,
          statusId,
          sectionId: source.sectionId,
          assigneeId: null,
          reporterId: auth.userId,
          priority: source.priority,
          dueDate: source.dueDate,
          position: nextPosition(lastInSection?.position ?? null),
          planningParentId: source.planningParentId,
        },
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      if (source.labels.length) {
        await auth.db.taskLabel.createMany({
          data: source.labels.map((row) => ({
            tenantId: auth.tenantId,
            taskId: created.id,
            labelId: row.labelId,
          })),
        });
      }
      if (source.customFieldValues.length) {
        await auth.db.customFieldValue.createMany({
          data: source.customFieldValues.map((row) => ({
            tenantId: auth.tenantId,
            taskId: created.id,
            fieldId: row.fieldId,
            value: row.value,
          })),
        });
      }
      await auth.db.activityLog.create({
        data: {
          tenantId: auth.tenantId,
          taskId: created.id,
          actorId: auth.userId,
          actorType: auth.actorType,
          via: auth.via,
          action: `copied from ${key}`,
        },
      });
      const fresh = await findTaskByKey(auth.db, taskKey(created.project.key, created.number));
      if (!fresh) throw notFound();
      const mapped = mapTask(fresh);
      publishTaskChange(auth, mapped, 'create');
      return mapped;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/comments', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ body: z.string().trim().min(1), parentId: z.string().optional() }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      await requireOpenProjectWrite(auth, row.project.key);
      return await postComment(auth, row, body.body, body.parentId);
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
      await requireOpenProjectWrite(auth, row.project.key);
      const c = await auth.db.comment.findFirst({ where: { id, taskId: row.id, deletedAt: null } });
      if (!c) throw notFound('Comment not found.');
      if (c.authorId !== auth.userId) throw forbidden('You can only edit your own comments.');
      const next = await auth.db.comment.update({ where: { id: c.id }, data: { body: body.body }, include: { reactions: true } });
      publishTaskChange(auth, { key: taskKey(row.project.key, row.number), projectKey: row.project.key }, 'comment');
      return mapComment(next, next.reactions);
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
      await requireOpenProjectWrite(auth, row.project.key);
      const c = await auth.db.comment.findFirst({ where: { id, taskId: row.id, deletedAt: null } });
      if (!c) throw notFound('Comment not found.');
      const canDelete = c.authorId === auth.userId || auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin';
      if (!canDelete) throw forbidden('You cannot delete this comment.');
      await auth.db.comment.updateMany({ where: { parentId: c.id, deletedAt: null }, data: { parentId: null } });
      await auth.db.comment.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
      publishTaskChange(auth, { key: taskKey(row.project.key, row.number), projectKey: row.project.key }, 'comment');
      return reply.status(204).send();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/comments/:id/reactions', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const body = z.object({ emoji: z.enum(COMMENT_REACTION_KINDS) }).parse(req.body);
      const row = await findTaskByKey(auth.db, key);
      if (!row) throw notFound();
      await requireOpenProjectWrite(auth, row.project.key);
      const c = await auth.db.comment.findFirst({ where: { id, taskId: row.id, deletedAt: null } });
      if (!c) throw notFound('Comment not found.');
      const existing = await auth.db.commentReaction.findFirst({
        where: { commentId: c.id, userId: auth.userId, emoji: body.emoji },
      });
      if (existing) {
        await auth.db.commentReaction.delete({ where: { id: existing.id } });
      } else {
        await auth.db.commentReaction.create({
          data: { tenantId: auth.tenantId, commentId: c.id, userId: auth.userId, emoji: body.emoji },
        });
      }
      const fresh = await auth.db.comment.findFirst({ where: { id: c.id }, include: { reactions: true } });
      if (!fresh) throw notFound('Comment not found.');
      publishTaskChange(auth, { key: taskKey(row.project.key, row.number), projectKey: row.project.key }, 'comment');
      return mapComment(fresh, fresh.reactions);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/convert-to-subtask', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({
        parentKey: z.string().trim().min(1),
        confirm: z.boolean().optional(),
      }).parse(req.body);
      return await convertTaskToSubtask(auth, key, body);
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
      await requireOpenProjectWrite(auth, row.project.key);
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
      return mapSubtask(child);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/tasks/:key/subtasks/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { id } = req.params as { id: string };
      const body = z.object({
        done: z.boolean().optional(),
        assigneeId: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
      }).refine((value) => value.done !== undefined || value.assigneeId !== undefined || value.dueDate !== undefined, {
        message: 'Nothing to update.',
      }).parse(req.body);
      const parentKey = (req.params as { key: string }).key;
      const parent = await findTaskByKey(auth.db, parentKey);
      if (!parent) throw notFound();
      await requireOpenProjectWrite(auth, parent.project.key);
      const existing = await auth.db.task.findFirst({ where: { id, parentId: parent.id, deletedAt: null } });
      if (!existing) throw notFound('Subtask not found.');
      const child = await auth.db.task.update({
        where: { id },
        data: {
          completedAt: body.done === undefined ? undefined : body.done ? new Date() : null,
          assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId,
          dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
        },
      });
      publishTaskChange(auth, { key: parentKey, projectKey: parent.project.key }, 'patch');
      return mapSubtask(child);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/tasks/:key/subtasks/:id/promote', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      return await promoteSubtask(auth, key, id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/tasks/:key/subtasks/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { id } = req.params as { id: string };
      const parentKey = (req.params as { key: string }).key;
      const parent = await findTaskByKey(auth.db, parentKey);
      if (!parent || parent.deletedAt) throw notFound();
      await requireOpenProjectWrite(auth, parent.project.key);
      const existing = await auth.db.task.findFirst({ where: { id, parentId: parent.id, deletedAt: null } });
      if (!existing) throw notFound('Subtask not found.');
      await auth.db.task.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: auth.userId },
      });
      const label = existing.title.replace(/\s+/g, ' ').trim().slice(0, 80);
      await auth.db.activityLog.create({
        data: {
          tenantId: auth.tenantId,
          taskId: parent.id,
          actorId: auth.userId,
          via: auth.via,
          action: `removed the subtask ${label}`,
        },
      });
      publishTaskChange(auth, { key: parentKey, projectKey: parent.project.key }, 'patch');
      return { key: taskKey(parent.project.key, existing.number) };
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
      await requireOpenProjectWrite(auth, row.project.key);
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
      const project = await requireOpenProjectWrite(auth, parsed.projectKey);
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
      await requireOpenProjectWrite(auth, row.project.key);
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
      await requireOpenProject(auth, row.project.key);
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
      await requireOpenProjectWrite(auth, row.project.key);
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
      await requireOpenProject(auth, row.project.key);
      const att = await auth.db.attachment.findFirst({ where: { id, taskId: row.id } });
      if (!att) throw notFound();
      const stream = await openAttachmentFile(auth.tenantId, att.storageKey);
      const mime = att.mime || 'application/octet-stream';
      const disposition = mime.startsWith('image/') ? 'inline' : 'attachment';
      return reply
        .header('Content-Type', mime)
        .header('Content-Disposition', `${disposition}; filename="${att.name.replace(/"/g, '')}"`)
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
      await requireOpenProjectWrite(auth, row.project.key);
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
      requireProjectWrite(auth);
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
