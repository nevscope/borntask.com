import { prisma } from '../db.js';
import type { TenantClient } from '../tenantPrisma.js';
import { stripTags } from './descriptionHtml.js';
import { comparePosition, mapStatus, mapUser, positionNumber, remapRoleSlug, remapTypeSlug } from './mappers.js';

const EMPTY_COUNTS = { backlog: 0, active: 0, review: 0, done: 0 };

export async function workflowView(db: TenantClient, workflowId: string) {
  const wf = await loadWorkflow(db, workflowId);
  const grouped = await db.task.groupBy({
    by: ['statusId'],
    where: { deletedAt: null, status: { workflowId } },
    _count: { _all: true },
  });
  const byId = new Map(grouped.map((g) => [g.statusId, g._count._all]));
  const projects = await db.project.findMany({
    where: { workflowId },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return {
    id: wf.id,
    name: wf.name,
    projectCount: projects.length,
    projectNames: projects.map((project) => project.name),
    statuses: wf.statuses.map((s) => ({
      ...s,
      taskCount: byId.get(wf.statusIdBySlug[s.id] ?? '') ?? 0,
    })),
    transitions: wf.transitions,
  };
}

export async function mapProjectCards(
  db: TenantClient,
  userId: string,
  rows: { id: string; key: string; name: string; colour: string; leadId: string | null; workflowId: string; updatedAt: Date; archivedAt?: Date | null }[],
) {
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const leadIds = [...new Set(rows.map((p) => p.leadId).filter((id): id is string => !!id))];
  const [grouped, statuses, favs, leads, members] = await Promise.all([
    db.task.groupBy({
      by: ['projectId', 'statusId'],
      where: { deletedAt: null, projectId: { in: ids } },
      _count: { _all: true },
    }),
    db.workflowStatus.findMany({ select: { id: true, category: true } }),
    db.favourite.findMany({ where: { userId }, select: { projectId: true } }),
    leadIds.length ? prisma.user.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    db.projectMember.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, userId: true } }),
  ]);
  const memberIds = [...new Set(members.map((m) => m.userId))];
  const guestRows = memberIds.length
    ? await db.tenantMember.findMany({
      where: { userId: { in: memberIds }, tenantRole: 'guest', isActive: true },
      select: { userId: true },
    })
    : [];
  const guestIds = new Set(guestRows.map((g) => g.userId));
  const categoryOf = new Map(statuses.map((s) => [s.id, s.category]));
  const starred = new Set(favs.map((f) => f.projectId));
  const leadName = new Map(leads.map((u) => [u.id, u.name]));

  return rows.map((p) => {
    const counts = { ...EMPTY_COUNTS };
    for (const g of grouped) {
      if (g.projectId !== p.id) continue;
      const cat = categoryOf.get(g.statusId);
      if (cat === 'backlog' || cat === 'active' || cat === 'review' || cat === 'done') counts[cat] += g._count._all;
    }
    const guestCount = members.filter((m) => m.projectId === p.id && guestIds.has(m.userId)).length;
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      color: p.colour,
      leadId: p.leadId ?? '',
      workflowId: p.workflowId,
      openCount: counts.backlog + counts.active + counts.review,
      counts,
      starred: starred.has(p.id),
      leadName: p.leadId ? leadName.get(p.leadId) ?? null : null,
      guestCount,
      updatedAt: p.updatedAt.toISOString(),
      archived: Boolean(p.archivedAt),
      canOpen: true,
      accessRequested: false,
    };
  });
}

export async function loadWorkflow(db: TenantClient, workflowId: string) {
  const wf = await db.workflow.findFirstOrThrow({
    where: { id: workflowId },
    include: { statuses: { orderBy: { position: 'asc' } }, transitions: true },
  });
  {
    const todo = wf.statuses.find((status) => status.slug === 'todo');
    const doing = wf.statuses.find((status) => status.slug === 'doing');
    const done = wf.statuses.find((status) => status.slug === 'done');
    const hasComplete = todo && done && wf.transitions.some((row) => row.fromStatusId === todo.id && row.toStatusId === done.id);
    if (todo && doing && done && !hasComplete) {
      await db.workflowTransition.create({
        data: {
          tenantId: wf.tenantId,
          workflowId: wf.id,
          fromStatusId: todo.id,
          toStatusId: done.id,
          allowedRoleIds: [],
          label: 'Complete',
        },
      });
      return loadWorkflow(db, workflowId);
    }
  }
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
      attachments: { select: { id: true } },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { comments: { where: { deletedAt: null } }, attachments: true } },
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
  attachments?: unknown[];
  comments?: { body: string; createdAt: Date; deletedAt?: Date | null }[];
  _count?: { comments?: number; attachments?: number };
}) {
  const sub = row.subtasks ?? [];
  const liveComments = (row.comments ?? []).filter((comment) => !comment.deletedAt);
  const last = liveComments.length
    ? [...liveComments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).at(-1)
    : undefined;
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
    commentCount: row._count?.comments ?? liveComments.length,
    attachmentCount: row._count?.attachments ?? (row.attachments?.length ?? 0),
    lastComment: last ? stripTags(last.body).replace(/\s+/g, ' ').trim() || null : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    githubBadge: null as 'pr_running' | 'pr_passed' | 'pr_failed' | 'merged' | 'branch' | null,
  };
}

export async function loadProjectDetail(db: TenantClient, key: string, userId: string) {
  const project = await db.project.findFirst({
    where: { key },
    include: { sections: true, members: { include: { roles: { include: { role: true } } } } },
  });
  if (!project) return null;
  const workflow = await loadWorkflow(db, project.workflowId);
  const userIds = [...new Set(project.members.map((m) => m.userId).concat(project.leadId ? [project.leadId] : []))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } } }) : [];
  const [card] = await mapProjectCards(db, userId, [project]);
  const tenantMembers = userIds.length
    ? await db.tenantMember.findMany({ where: { userId: { in: userIds } } })
    : [];
  const wsRole = new Map(tenantMembers.map((m) => [m.userId, m.tenantRole]));
  return {
    project: card!,
    sections: [...project.sections]
      .sort((a, b) => comparePosition(a.position, b.position))
      .map((s, i) => ({
      id: s.id,
      projectKey: project.key,
      name: s.name,
      position: i,
    })),
    members: project.members.map((m) => ({
      userId: m.userId,
      roles: m.roles.map((r) => remapRoleSlug(r.role.slug)),
      workspaceRole: wsRole.get(m.userId) ?? 'member',
    })),
    users: users.map(mapUser),
    disabledTypes: project.disabledTypes.split(',').map((slug) => slug.trim()).filter(Boolean),
    workflow: {
      id: workflow.id,
      name: workflow.name,
      statuses: workflow.statuses,
      transitions: workflow.transitions,
    },
  };
}

export { mapUser };
