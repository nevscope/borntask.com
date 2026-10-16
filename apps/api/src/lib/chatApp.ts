import { timingSafeEqual } from 'node:crypto';
import {
  chatAppUsageText,
  chatCreatedCard,
  chatRejectDialog,
  interpretChatEvent,
  chatActorEmail,
  type ChatTaskType,
} from '@borntask/shared';
import { prisma, createTenantClient } from '../db.js';
import type { Authed } from '../context.js';
import { config, chatAppEnabled } from '../env.js';
import { ApiError } from '../errors.js';
import { persistDescription } from './descriptionHtml.js';
import { loadWorkflow, taskKey } from './loadProject.js';
import { nextPosition } from './mappers.js';
import { moveTask } from './moveTask.js';
import { actorName, enqueueChat, taskUrl } from './chatNotify.js';

export { chatAppEnabled };

export function verifyChatAppRequest(authorization: string | undefined): boolean {
  const expected = config.googleChatAppVerificationToken;
  if (!expected) return false;
  const raw = authorization ?? '';
  const parts = raw.split(' ');
  const got = parts[0]?.toLowerCase() === 'bearer' ? (parts[1] ?? '') : raw;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authForEmail(email: string): Promise<Authed> {
  const row = await prisma.user.findFirst({ where: { email } });
  if (!row) throw new ApiError(403, 'FORBIDDEN', 'Your Chat email is not a BornTask account.');
  const memberships = await prisma.tenantMember.findMany({
    where: { userId: row.id, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  const membership = memberships[0];
  if (!membership) throw new ApiError(403, 'FORBIDDEN', 'You are not in a BornTask workspace.');
  return {
    userId: row.id,
    tenantId: membership.tenantId,
    workspaceRole: membership.tenantRole,
    db: createTenantClient(membership.tenantId),
    via: 'app',
    actorType: 'user',
    tokenScope: 'session',
  };
}

async function resolveProject(auth: Authed, projectKey: string): Promise<{ project: { id: string; key: string; name: string; workflowId: string }; auth: Authed }> {
  const inTenant = await auth.db.project.findFirst({ where: { key: projectKey } });
  if (inTenant) {
    await assertCanCreate(auth, inTenant.id);
    return { project: inTenant, auth };
  }
  const others = await prisma.project.findMany({ where: { key: projectKey } });
  for (const project of others) {
    const member = await prisma.tenantMember.findFirst({
      where: { tenantId: project.tenantId, userId: auth.userId, isActive: true },
    });
    if (!member) continue;
    const scoped: Authed = {
      ...auth,
      tenantId: project.tenantId,
      workspaceRole: member.tenantRole,
      db: createTenantClient(project.tenantId),
    };
    await assertCanCreate(scoped, project.id);
    return { project, auth: scoped };
  }
  throw new ApiError(400, 'VALIDATION', `No project ${projectKey} that you can use.`);
}

async function assertCanCreate(auth: Authed, projectId: string) {
  if (auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin') return;
  const on = await auth.db.projectMember.findFirst({ where: { projectId, userId: auth.userId } });
  if (!on) throw new ApiError(403, 'FORBIDDEN', "You're not on that project.");
}

async function defaultSectionId(auth: Authed, projectId: string): Promise<string> {
  const section = await auth.db.section.findFirst({
    where: { projectId },
    orderBy: { position: 'asc' },
  });
  if (!section) throw new ApiError(400, 'VALIDATION', 'This project has no section to put a task in.');
  return section.id;
}

export async function createTaskFromChat(
  auth: Authed,
  input: { projectKey: string; type: ChatTaskType; title: string; description: string },
) {
  const { project, auth: scoped } = await resolveProject(auth, input.projectKey);
  const type = await scoped.db.taskType.findFirst({ where: { slug: input.type } });
  if (!type) throw new ApiError(400, 'VALIDATION', 'Unknown type.');
  const ws = await scoped.db.workspace.findUnique({ where: { id: scoped.tenantId } });
  const wf = await loadWorkflow(scoped.db, project.workflowId);
  const startSlug = input.type === 'bug' ? (ws?.bugsStartIn === 'idea' ? 'idea' : 'approved') : 'idea';
  const statusId = wf.statusIdBySlug[startSlug] ?? wf.statusIdBySlug.todo ?? Object.values(wf.statusIdBySlug)[0];
  if (!statusId) throw new ApiError(400, 'VALIDATION', 'Workflow has no start status.');
  const sectionId = await defaultSectionId(scoped, project.id);
  const last = await scoped.db.task.findFirst({ where: { projectId: project.id }, orderBy: { number: 'desc' } });
  const lastInSection = await scoped.db.task.findFirst({
    where: { sectionId, deletedAt: null },
    orderBy: { position: 'desc' },
  });
  const created = await scoped.db.task.create({
    data: {
      tenantId: scoped.tenantId,
      projectId: project.id,
      number: (last?.number ?? 0) + 1,
      title: input.title.slice(0, 200),
      description: persistDescription(input.description),
      typeId: type.id,
      statusId,
      sectionId,
      reporterId: scoped.userId,
      priority: 'none',
      position: nextPosition(lastInSection?.position ?? null),
    },
    include: { type: true, status: true, project: true },
  });
  await scoped.db.activityLog.create({
    data: {
      tenantId: scoped.tenantId,
      taskId: created.id,
      actorId: scoped.userId,
      actorType: scoped.actorType,
      via: 'app',
      action: `created this ${input.type} from Google Chat`,
    },
  });
  const key = taskKey(created.project.key, created.number);
  const url = taskUrl(created.project.key, key);
  if (input.type === 'idea') {
    const name = await actorName(scoped.userId);
    await enqueueChat(scoped, {
      projectId: created.projectId,
      event: 'new_idea',
      title: created.title,
      taskKey: key,
      projectName: created.project.name,
      text: `${name} raised an idea from Google Chat.`,
      url,
    });
  }
  return {
    taskKey: key,
    title: created.title,
    projectName: created.project.name,
    typeName: created.type.name,
    statusName: created.status.name,
    url,
  };
}

export async function applyIdeaCardAction(
  auth: Authed,
  input: { taskKey: string; toStatusId: 'approved' | 'rejected'; comment?: string },
  move: typeof moveTask = moveTask,
) {
  return move(auth, input.taskKey, { toStatusId: input.toStatusId, comment: input.comment });
}

function textReply(text: string) {
  return { text };
}

async function projectKeyForMessage(auth: Authed): Promise<string> {
  const memberships = await auth.db.projectMember.findMany({
    include: { project: { select: { key: true } } },
    take: 2,
  });
  if (memberships.length === 1 && memberships[0]) return memberships[0].project.key;
  throw new ApiError(
    400,
    'VALIDATION',
    'Say which project with /borntask idea WEB title here, or use that slash on the message.',
  );
}

export type ChatAppDeps = {
  authForEmail: (email: string) => Promise<Authed>;
  createTask: typeof createTaskFromChat;
  projectKeyForMessage: (auth: Authed) => Promise<string>;
  moveTask: typeof moveTask;
};

export const defaultChatAppDeps: ChatAppDeps = {
  authForEmail,
  createTask: createTaskFromChat,
  projectKeyForMessage,
  moveTask,
};

export async function handleChatAppEvent(event: Record<string, unknown>, deps: ChatAppDeps = defaultChatAppDeps) {
  const intent = interpretChatEvent(event);
  if (intent.kind === 'ignore') return {};
  if (intent.kind === 'added' || intent.kind === 'help') {
    return textReply(chatAppUsageText());
  }

  const email = chatActorEmail(event);
  if (!email) return textReply('BornTask could not see your Chat email. Ask your Workspace admin to allow the app to read member email.');
  const auth = await deps.authForEmail(email);

  try {
    if (intent.kind === 'slash') {
      const created = await deps.createTask(auth, {
        projectKey: intent.projectKey,
        type: intent.type,
        title: intent.title,
        description: '',
      });
      return chatCreatedCard(created);
    }
    if (intent.kind === 'create_message') {
      const projectKey = await deps.projectKeyForMessage(auth);
      const extra = intent.sourceUrl ? `\n\nFrom Google Chat: ${intent.sourceUrl}` : '\n\nFrom a Google Chat message.';
      const created = await deps.createTask(auth, {
        projectKey,
        type: 'idea',
        title: intent.title,
        description: `${intent.description}${extra}`,
      });
      return chatCreatedCard(created);
    }
    if (intent.kind === 'reject_need_comment') {
      return chatRejectDialog(intent.taskKey);
    }
    if (intent.kind === 'approve') {
      await applyIdeaCardAction(auth, { taskKey: intent.taskKey, toStatusId: 'approved' }, deps.moveTask);
      return textReply(`Approved ${intent.taskKey}.`);
    }
    if (intent.kind === 'reject') {
      await applyIdeaCardAction(auth, {
        taskKey: intent.taskKey,
        toStatusId: 'rejected',
        comment: intent.comment,
      }, deps.moveTask);
      return textReply(`Rejected ${intent.taskKey}.`);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'COMMENT_REQUIRED') {
        const key = 'taskKey' in intent ? intent.taskKey : '';
        return chatRejectDialog(key);
      }
      return textReply(err.message);
    }
    throw err;
  }
  return {};
}
