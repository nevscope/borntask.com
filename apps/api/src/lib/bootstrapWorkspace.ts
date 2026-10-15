import type { Prisma, PrismaClient } from '@prisma/client';
import type { TenantClient } from '../tenantPrisma.js';

const TYPE_TEMPLATES: Record<string, string> = {
  idea: '## Problem\n\n## Who benefits\n',
  bug: '## Steps\n\n## Expected\n\n## Actual\n',
  improvement: '## Today\n\n## Proposed\n',
  feature: '## Acceptance criteria\n\n- \n',
};

type Db = PrismaClient | TenantClient;

export async function bootstrapWorkspaceDefaults(db: Db, tenantId: string) {
  const types = [
    { slug: 'idea', name: 'Idea', colour: '#5B3FC4' },
    { slug: 'bug', name: 'Bug', colour: '#B42323' },
    { slug: 'improvement', name: 'Improvement', colour: '#8A5A0B' },
    { slug: 'feature', name: 'Feature', colour: '#1F55B8' },
  ];
  for (const t of types) {
    await db.taskType.create({
      data: { tenantId, ...t, template: TYPE_TEMPLATES[t.slug] ?? null },
    });
  }

  const roles = [
    { slug: 'lead', name: 'Project lead', colour: '#121417' },
    { slug: 'business', name: 'Business', colour: '#3B49B8' },
    { slug: 'developer', name: 'Developer', colour: '#1F55B8' },
    { slug: 'tester', name: 'Tester', colour: '#8A5A0B' },
    { slug: 'observer', name: 'Observer', colour: '#5B6157' },
  ];
  const roleIds: Record<string, string> = {};
  for (const r of roles) {
    const row = await db.projectRole.create({ data: { tenantId, ...r } });
    roleIds[r.slug] = row.id;
  }

  const delivery = await seedDelivery(db, tenantId, roleIds);
  await seedSimple(db, tenantId);
  await db.workspace.update({
    where: { id: tenantId },
    data: { defaultWorkflowId: delivery.id },
  });
  return { deliveryId: delivery.id, roleIds };
}

async function seedDelivery(db: Db, tenantId: string, roleIds: Record<string, string>) {
  const wf = await db.workflow.create({
    data: { tenantId, name: 'Delivery', slug: 'delivery', isDefault: true, isTemplate: true },
  });
  const specs: { slug: string; name: string; category: Prisma.WorkflowStatusCreateInput['category']; position: number }[] = [
    { slug: 'idea', name: 'Idea', category: 'backlog', position: 0 },
    { slug: 'approved', name: 'Approved', category: 'backlog', position: 1 },
    { slug: 'wip', name: 'WIP', category: 'active', position: 2 },
    { slug: 'ready_for_testing', name: 'Ready for testing', category: 'review', position: 3 },
    { slug: 'testing', name: 'Testing', category: 'review', position: 4 },
    { slug: 'deployed', name: 'Deployed', category: 'done', position: 5 },
    { slug: 'on_hold', name: 'On hold', category: 'backlog', position: 90 },
    { slug: 'rejected', name: 'Rejected', category: 'done', position: 91 },
  ];
  const ids: Record<string, string> = {};
  for (const s of specs) {
    const row = await db.workflowStatus.create({ data: { tenantId, workflowId: wf.id, ...s } });
    ids[s.slug] = row.id;
  }
  const biz = [roleIds.business, roleIds.lead].filter((x): x is string => !!x);
  const dev = [roleIds.developer, roleIds.lead].filter((x): x is string => !!x);
  const tes = [roleIds.tester, roleIds.lead].filter((x): x is string => !!x);
  const moves: { from: string; to: string; roles: string[]; requireComment?: boolean; label?: string }[] = [
    { from: 'idea', to: 'approved', roles: biz, label: 'Approve' },
    { from: 'idea', to: 'rejected', roles: biz, requireComment: true, label: 'Reject' },
    { from: 'approved', to: 'wip', roles: dev },
    { from: 'wip', to: 'ready_for_testing', roles: dev },
    { from: 'ready_for_testing', to: 'testing', roles: tes },
    { from: 'testing', to: 'deployed', roles: tes, label: 'Pass' },
    { from: 'testing', to: 'wip', roles: tes, requireComment: true, label: 'Fail' },
    { from: 'idea', to: 'on_hold', roles: [] },
    { from: 'approved', to: 'on_hold', roles: [] },
    { from: 'wip', to: 'on_hold', roles: [] },
    { from: 'ready_for_testing', to: 'on_hold', roles: [] },
    { from: 'testing', to: 'on_hold', roles: [] },
  ];
  for (const m of moves) {
    await db.workflowTransition.create({
      data: {
        tenantId,
        workflowId: wf.id,
        fromStatusId: ids[m.from]!,
        toStatusId: ids[m.to]!,
        allowedRoleIds: m.roles,
        requireComment: m.requireComment ?? false,
        label: m.label,
        notifyAssignee: true,
      },
    });
  }
  return wf;
}

export async function createOpenWorkflow(db: Db, tenantId: string, name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'workflow';
  let slug = base;
  const clash = await db.workflow.findFirst({ where: { tenantId, slug } });
  if (clash) slug = `${base.slice(0, 24)}-${Math.random().toString(36).slice(2, 6)}`;
  const wf = await db.workflow.create({
    data: { tenantId, name, slug, isDefault: false, isTemplate: false },
  });
  const specs: { slug: string; name: string; category: Prisma.WorkflowStatusCreateInput['category']; position: number }[] = [
    { slug: 'todo', name: 'To do', category: 'backlog', position: 0 },
    { slug: 'doing', name: 'Doing', category: 'active', position: 1 },
    { slug: 'done', name: 'Done', category: 'done', position: 2 },
  ];
  const ids: Record<string, string> = {};
  for (const s of specs) {
    const row = await db.workflowStatus.create({ data: { tenantId, workflowId: wf.id, ...s } });
    ids[s.slug] = row.id;
  }
  for (const [from, to] of [['todo', 'doing'], ['doing', 'done'], ['done', 'todo'], ['doing', 'todo']] as const) {
    await db.workflowTransition.create({
      data: {
        tenantId,
        workflowId: wf.id,
        fromStatusId: ids[from]!,
        toStatusId: ids[to]!,
        allowedRoleIds: [],
      },
    });
  }
  return wf;
}

async function seedSimple(db: Db, tenantId: string) {
  const wf = await db.workflow.create({
    data: { tenantId, name: 'Simple', slug: 'simple', isDefault: false, isTemplate: true },
  });
  const specs: { slug: string; name: string; category: Prisma.WorkflowStatusCreateInput['category']; position: number }[] = [
    { slug: 'todo', name: 'To do', category: 'backlog', position: 0 },
    { slug: 'doing', name: 'Doing', category: 'active', position: 1 },
    { slug: 'done', name: 'Done', category: 'done', position: 2 },
  ];
  const ids: Record<string, string> = {};
  for (const s of specs) {
    const row = await db.workflowStatus.create({ data: { tenantId, workflowId: wf.id, ...s } });
    ids[s.slug] = row.id;
  }
  for (const [from, to] of [['todo', 'doing'], ['doing', 'done'], ['done', 'todo'], ['doing', 'todo']] as const) {
    await db.workflowTransition.create({
      data: {
        tenantId,
        workflowId: wf.id,
        fromStatusId: ids[from]!,
        toStatusId: ids[to]!,
        allowedRoleIds: [],
      },
    });
  }
  return wf;
}
