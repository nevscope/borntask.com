import { persistDescription, stripTags } from './descriptionHtml.js';
import { ApiError, notFound, validation } from '../errors.js';
import type { Authed } from '../context.js';
import { findTaskByKey, mapTask, taskKey } from './loadProject.js';
import { nextPosition } from './mappers.js';
import { publishTaskChange } from './live.js';
import { postComment } from './postComment.js';
import { requireOpenProjectWrite } from './projectAccess.js';

export const CONVERT_CONFIRM_MESSAGE =
  'This task has comments, attachments or history. Those will be copied onto a comment on the parent.';

export type ConvertLoss = {
  comments: number;
  attachments: number;
  history: number;
};

export function isCreatedOnlyActivity(action: string): boolean {
  return /^created this\b/i.test(action.trim());
}

export function convertLoss(input: {
  comments: unknown[];
  attachments: unknown[];
  activity: { action: string }[];
}): ConvertLoss {
  return {
    comments: input.comments.length,
    attachments: input.attachments.length,
    history: input.activity.filter((row) => !isCreatedOnlyActivity(row.action)).length,
  };
}

export function convertNeedsConfirm(loss: ConvertLoss): boolean {
  return loss.comments > 0 || loss.attachments > 0 || loss.history > 0;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paragraph(value: string): string {
  const text = stripTags(value).trim();
  if (!text) return '';
  return `<p>${escapeText(text)}</p>`;
}

export function buildMovedUnderComment(input: {
  childKey: string;
  title: string;
  description?: string | null;
  comments: { authorName: string; body: string }[];
  attachments: { name: string }[];
  activity: { action: string }[];
}): string {
  const parts = [
    paragraph(`Moved ${input.childKey} (${input.title}) under this task as a subtask.`),
  ];
  const description = paragraph(input.description ?? '');
  if (description) {
    parts.push(paragraph('Description'), description);
  }
  if (input.comments.length) {
    parts.push(paragraph('Comments'));
    for (const comment of input.comments) {
      const body = stripTags(comment.body).trim() || '(empty)';
      parts.push(paragraph(`${comment.authorName}: ${body}`));
    }
  }
  if (input.attachments.length) {
    parts.push(paragraph(`Attachments: ${input.attachments.map((file) => file.name).join(', ')}`));
  }
  const history = input.activity.filter((row) => !isCreatedOnlyActivity(row.action));
  if (history.length) {
    parts.push(paragraph('History'));
    for (const row of history) {
      parts.push(paragraph(row.action));
    }
  }
  return persistDescription(parts.filter(Boolean).join(''));
}

export function convertConfirmError(loss: ConvertLoss): ApiError {
  return new ApiError(409, 'CONFLICT', CONVERT_CONFIRM_MESSAGE, { needsConfirm: true, ...loss });
}

export async function convertTaskToSubtask(
  auth: Authed,
  key: string,
  input: { parentKey: string; confirm?: boolean },
) {
  const child = await findTaskByKey(auth.db, key);
  if (!child || child.deletedAt) throw notFound('Task not found.');
  const parent = await findTaskByKey(auth.db, input.parentKey);
  if (!parent || parent.deletedAt) throw notFound('Parent task not found.');
  if (child.id === parent.id) throw validation('A task cannot sit under itself.');
  if (child.parentId) throw validation('This is already a subtask.');
  if (parent.parentId) throw validation('Choose a task, not a checklist item.');
  await requireOpenProjectWrite(auth, child.project.key);
  await requireOpenProjectWrite(auth, parent.project.key);

  const nested = await auth.db.task.count({ where: { parentId: child.id, deletedAt: null } });
  if (nested > 0) throw validation('Promote or move this task\'s subtasks first.');

  const comments = await auth.db.comment.findMany({
    where: { taskId: child.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { name: true } } },
  });
  const attachments = await auth.db.attachment.findMany({ where: { taskId: child.id }, orderBy: { createdAt: 'asc' } });
  const activity = await auth.db.activityLog.findMany({
    where: { taskId: child.id },
    orderBy: { at: 'asc' },
  });
  const loss = convertLoss({ comments, attachments, activity });
  if (convertNeedsConfirm(loss) && !input.confirm) throw convertConfirmError(loss);

  const childKey = taskKey(child.project.key, child.number);
  const parentKey = taskKey(parent.project.key, parent.number);

  const updated = await auth.db.task.update({
    where: { id: child.id },
    data: { parentId: parent.id, planningParentId: null },
  });

  if (convertNeedsConfirm(loss) || stripTags(child.description ?? '')) {
    await postComment(
      auth,
      parent,
      buildMovedUnderComment({
        childKey,
        title: child.title,
        description: child.description,
        comments: comments.map((row) => ({ authorName: row.author.name, body: row.body })),
        attachments,
        activity,
      }),
    );
  }

  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: parent.id,
      actorId: auth.userId,
      via: auth.via,
      action: `moved ${childKey} under this task as a subtask`,
    },
  });
  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: child.id,
      actorId: auth.userId,
      via: auth.via,
      action: `moved under ${parentKey} as a subtask`,
    },
  });

  publishTaskChange(auth, { key: childKey, projectKey: child.project.key }, 'delete');
  publishTaskChange(auth, { key: parentKey, projectKey: parent.project.key }, 'patch');

  return {
    parentKey,
    redirectedTo: parentKey,
    subtask: {
      id: updated.id,
      title: updated.title,
      done: Boolean(updated.completedAt),
      assigneeId: updated.assigneeId,
      dueDate: updated.dueDate ? updated.dueDate.toISOString().slice(0, 10) : null,
    },
  };
}

export async function promoteSubtask(auth: Authed, parentKey: string, id: string) {
  const parent = await findTaskByKey(auth.db, parentKey);
  if (!parent || parent.deletedAt) throw notFound();
  await requireOpenProjectWrite(auth, parent.project.key);
  const child = await auth.db.task.findFirst({
    where: { id, parentId: parent.id, deletedAt: null },
    include: { project: true },
  });
  if (!child) throw notFound('Subtask not found.');

  const lastInSection = await auth.db.task.findFirst({
    where: { sectionId: child.sectionId, deletedAt: null, parentId: null },
    orderBy: { position: 'desc' },
  });
  await auth.db.task.update({
    where: { id: child.id },
    data: {
      parentId: null,
      position: nextPosition(lastInSection?.position ?? null),
    },
  });

  const childKey = taskKey(child.project.key, child.number);
  const parentTaskKey = taskKey(parent.project.key, parent.number);
  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: child.id,
      actorId: auth.userId,
      via: auth.via,
      action: `promoted from a subtask on ${parentTaskKey}`,
    },
  });
  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: parent.id,
      actorId: auth.userId,
      via: auth.via,
      action: `promoted ${childKey} to its own task`,
    },
  });

  publishTaskChange(auth, { key: childKey, projectKey: child.project.key }, 'create');
  publishTaskChange(auth, { key: parentTaskKey, projectKey: parent.project.key }, 'patch');

  const fresh = await findTaskByKey(auth.db, childKey);
  if (!fresh) throw notFound();
  return mapTask(fresh);
}
