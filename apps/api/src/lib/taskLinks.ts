import {
  directedTaskLink,
  isTaskLinkRelation,
  otherTaskId,
  viewTaskLink,
  type TaskLinkKind,
  type TaskLinkRelation,
  type TaskLinkView,
} from '@borntask/shared';
import type { Authed } from '../context.js';
import { notFound, validation } from '../errors.js';
import type { TenantClient } from '../tenantPrisma.js';
import { publishTaskChange } from './live.js';
import { findTaskByKey, taskKey } from './loadProject.js';
import { requireOpenProject, requireOpenProjectWrite } from './projectAccess.js';

export type TaskLinkDto = {
  id: string;
  type: TaskLinkView;
  key: string;
  title: string;
  projectKey: string;
};

export async function insertTaskLink(
  db: TenantClient,
  tenantId: string,
  fromId: string,
  toId: string,
  relation: TaskLinkRelation,
) {
  const directed = directedTaskLink(fromId, toId, relation);
  const existing = await db.taskLink.findFirst({
    where: { fromTaskId: directed.fromTaskId, toTaskId: directed.toTaskId, kind: directed.kind },
  });
  if (existing) return existing;
  return db.taskLink.create({
    data: {
      tenantId,
      fromTaskId: directed.fromTaskId,
      toTaskId: directed.toTaskId,
      kind: directed.kind,
    },
  });
}

export async function deleteTaskLinkRow(db: TenantClient, id: string) {
  await db.taskLink.delete({ where: { id } });
}

function normaliseRelation(value: string): TaskLinkRelation | null {
  const slug = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (slug === 'blockedby') return 'blocked_by';
  if (slug === 'relates_to') return 'relates';
  return isTaskLinkRelation(slug) ? slug : null;
}

export async function blockedTaskIds(db: TenantClient, taskIds: string[]): Promise<Set<string>> {
  if (!taskIds.length) return new Set();
  const rows = await db.taskLink.findMany({
    where: {
      kind: 'blocks',
      toTaskId: { in: taskIds },
      from: { deletedAt: null, completedAt: null },
    },
    select: { toTaskId: true },
  });
  return new Set(rows.map((row) => row.toTaskId));
}

export async function listTaskLinks(
  db: TenantClient,
  taskId: string,
  canOpen: (projectId: string) => boolean,
): Promise<TaskLinkDto[]> {
  const rows = await db.taskLink.findMany({
    where: { OR: [{ fromTaskId: taskId }, { toTaskId: taskId }] },
    include: { from: { include: { project: true } }, to: { include: { project: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const out: TaskLinkDto[] = [];
  for (const row of rows) {
    const other = row.fromTaskId === taskId ? row.to : row.from;
    if (other.deletedAt || !canOpen(other.projectId)) continue;
    out.push({
      id: row.id,
      type: viewTaskLink(taskId, row.fromTaskId, row.toTaskId, row.kind),
      key: taskKey(other.project.key, other.number),
      title: other.title,
      projectKey: other.project.key,
    });
  }
  return out;
}

export async function createTaskLink(
  auth: Authed,
  fromKey: string,
  relationRaw: string,
  otherKey: string,
): Promise<TaskLinkDto> {
  const relation = normaliseRelation(relationRaw);
  if (!relation) throw validation('Use blocks, blocked by, relates to or duplicates.');
  const from = await findTaskByKey(auth.db, fromKey);
  if (!from || from.deletedAt) throw notFound();
  await requireOpenProjectWrite(auth, from.project.key);
  const other = await findTaskByKey(auth.db, otherKey);
  if (!other || other.deletedAt) throw notFound('That task was not found.');
  await requireOpenProject(auth, other.project.key);
  if (from.id === other.id) throw validation('A task cannot link to itself.');

  const row = await insertTaskLink(auth.db, auth.tenantId, from.id, other.id, relation);

  const label = relation === 'blocked_by' ? 'blocked by' : relation === 'relates' ? 'relates to' : relation;
  await auth.db.activityLog.createMany({
    data: [
      { tenantId: auth.tenantId, taskId: from.id, actorId: auth.userId, via: auth.via, action: `linked ${otherKey} (${label})` },
      { tenantId: auth.tenantId, taskId: other.id, actorId: auth.userId, via: auth.via, action: `linked from ${fromKey} (${label})` },
    ],
  });
  publishTaskChange(auth, { key: taskKey(from.project.key, from.number), projectKey: from.project.key }, 'patch');
  publishTaskChange(auth, { key: taskKey(other.project.key, other.number), projectKey: other.project.key }, 'patch');

  const otherId = otherTaskId(from.id, row.fromTaskId, row.toTaskId);
  const otherRow = otherId === other.id ? other : from;
  return {
    id: row.id,
    type: viewTaskLink(from.id, row.fromTaskId, row.toTaskId, row.kind as TaskLinkKind),
    key: taskKey(otherRow.project.key, otherRow.number),
    title: otherRow.title,
    projectKey: otherRow.project.key,
  };
}

export async function removeTaskLink(auth: Authed, fromKey: string, linkId: string): Promise<void> {
  const from = await findTaskByKey(auth.db, fromKey);
  if (!from || from.deletedAt) throw notFound();
  await requireOpenProjectWrite(auth, from.project.key);
  const row = await auth.db.taskLink.findFirst({
    where: { id: linkId, OR: [{ fromTaskId: from.id }, { toTaskId: from.id }] },
    include: { from: { include: { project: true } }, to: { include: { project: true } } },
  });
  if (!row) throw notFound('That link was not found.');
  await deleteTaskLinkRow(auth.db, row.id);
  const other = row.fromTaskId === from.id ? row.to : row.from;
  await auth.db.activityLog.createMany({
    data: [
      { tenantId: auth.tenantId, taskId: from.id, actorId: auth.userId, via: auth.via, action: `removed link to ${taskKey(other.project.key, other.number)}` },
      { tenantId: auth.tenantId, taskId: other.id, actorId: auth.userId, via: auth.via, action: `removed link from ${fromKey}` },
    ],
  });
  publishTaskChange(auth, { key: taskKey(from.project.key, from.number), projectKey: from.project.key }, 'patch');
  publishTaskChange(auth, { key: taskKey(other.project.key, other.number), projectKey: other.project.key }, 'patch');
}
