import { prisma } from '../db.js';
import type { TenantClient } from '../tenantPrisma.js';
import { mapStatus, mapUser, positionNumber, remapRoleSlug, remapTypeSlug } from './mappers.js';

export async function loadWorkflow(db: TenantClient, workflowId: string) {
  const wf = await db.workflow.findFirstOrThrow({
    where: { id: workflowId },
    include: { statuses: { orderBy: { position: 'asc' } }, transitions: true },
  });
  const roles = await db.projectRole.findMany();
  const slugByRoleId = new Map(roles.map((r) => [r.id, r.slug]));
  const slugByStatusId = new Map(wf.statuses.map((s) => [s.id, s.slug]));
  return {
    id: wf.id,
    name: wf.name,
    statuses: wf.statuses.map(mapStatus),
    transitions: wf.transitions.map((t) => ({
      from: slugByStatusId.get(t.fromStatusId) ?? t.fromStatusId,
      to: slugByStatusId.get(t.toStatusId) ?? t.toStatusId,
      roles: (Array.isArray(t.allowedRoleIds) ? t.allowedRoleIds : []).map((id) =>
        remapRoleSlug(slugByRoleId.get(String(id)) ?? 'observer'),
      ),
      requireComment: t.requireComment,
      label: t.label,
    })),
    statusIdBySlug: Object.fromEntries(wf.statuses.map((s) => [s.slug, s.id])),
    slugByStatusId: Object.fromEntries(wf.statuses.map((s) => [s.id, s.slug])),
  };
}

export function taskKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

export function parseTaskKey(key: string): { projectKey: string; number: number } | null {
  const i = key.lastIndexOf('-');
  if (i <= 0) return null;
  const projectKey = key.slice(0, i);
  const number = Number(key.slice(i + 1));
  if (!projectKey || !Number.isInteger(number)) return null;
  return { projectKey, number };
}

export async function findTaskByKey(db: TenantClient, key: string) {
  const parsed = parseTaskKey(key);
  if (!parsed) return null;
  const project = await db.project.findFirst({ where: { key: parsed.projectKey } });
  if (!project) return null;
  return db.task.findFirst({
    where: { projectId: project.id, number: parsed.number },
    include: {
      type: true,
      status: true,
      previousStatus: true,
      section: true,
      project: true,
      labels: { include: { label: true } },
    },
  });
}

export function mapTask(row: {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: { slug: string };
  status: { slug: string };
  previousStatus: { slug: string } | null;
  sectionId: string;
  assigneeId: string | null;
  reporterId: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  dueDate: Date | null;
  position: string;
  createdAt: Date;
  updatedAt: Date;
  project: { key: string };
  labels?: { label: { name: string } }[];
  subtasks?: { completedAt: Date | null }[];
}) {
  const sub = row.subtasks ?? [];
  return {
    id: row.id,
    key: taskKey(row.project.key, row.number),
    projectKey: row.project.key,
    title: row.title,
    description: row.description ?? '',
    type: remapTypeSlug(row.type.slug),
    statusId: row.status.slug,
    previousStatusId: row.previousStatus?.slug ?? null,
    sectionId: row.sectionId,
    assigneeId: row.assigneeId,
    reporterId: row.reporterId,
    priority: row.priority,
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    labels: (row.labels ?? []).map((l) => l.label.name),
    position: positionNumber(row.position),
    subtaskCount: { done: sub.filter((s) => s.completedAt).length, total: sub.length },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadProjectDetail(db: TenantClient, key: string) {
  const project = await db.project.findFirst({
    where: { key },
    include: { sections: { orderBy: { position: 'asc' } }, members: { include: { roles: { include: { role: true } } } } },
  });
  if (!project) return null;
  const workflow = await loadWorkflow(db, project.workflowId);
  const userIds = [...new Set(project.members.map((m) => m.userId).concat(project.leadId ? [project.leadId] : []))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } } }) : [];
  const open = await db.task.count({
    where: { projectId: project.id, deletedAt: null, status: { category: { not: 'done' } } },
  });
  return {
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
      color: project.colour,
      leadId: project.leadId ?? '',
      workflowId: project.workflowId,
      openCount: open,
    },
    sections: project.sections.map((s, i) => ({
      id: s.id,
      projectKey: project.key,
      name: s.name,
      position: i,
    })),
    members: project.members.map((m) => ({
      userId: m.userId,
      roles: m.roles.map((r) => remapRoleSlug(r.role.slug)),
    })),
    users: users.map(mapUser),
    workflow: {
      id: workflow.id,
      name: workflow.name,
      statuses: workflow.statuses,
      transitions: workflow.transitions,
    },
  };
}

export { mapUser };
