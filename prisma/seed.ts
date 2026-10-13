import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TYPE_TEMPLATES: Record<string, string> = {
  idea: '## Problem\n\n## Who benefits\n',
  bug: '## Steps\n\n## Expected\n\n## Actual\n',
  improvement: '## Today\n\n## Proposed\n',
  feature: '## Acceptance criteria\n\n- \n',
};

async function seedWorkspace(opts: {
  slug: string;
  name: string;
  isInternal: boolean;
  ownerEmail: string;
  ownerName: string;
}) {
  const owner = await prisma.user.upsert({
    where: { email: opts.ownerEmail },
    update: { name: opts.ownerName },
    create: { email: opts.ownerEmail, name: opts.ownerName },
  });

  const existing = await prisma.workspace.findUnique({ where: { slug: opts.slug } });
  if (existing) return { workspace: existing, owner };

  const workspace = await prisma.workspace.create({
    data: {
      name: opts.name,
      slug: opts.slug,
      isInternal: opts.isInternal,
      bugsStartIn: 'approved',
      timeZone: 'Europe/Malta',
    },
  });

  await prisma.tenantMember.create({
    data: {
      tenantId: workspace.id,
      userId: owner.id,
      tenantRole: 'owner',
    },
  });

  const types = [
    { slug: 'idea', name: 'Idea', colour: '#5B3FC4' },
    { slug: 'bug', name: 'Bug', colour: '#B42323' },
    { slug: 'improvement', name: 'Improvement', colour: '#8A5A0B' },
    { slug: 'feature', name: 'Feature', colour: '#1F55B8' },
  ];
  for (const t of types) {
    await prisma.taskType.create({
      data: {
        tenantId: workspace.id,
        ...t,
        template: TYPE_TEMPLATES[t.slug] ?? null,
      },
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
    const row = await prisma.projectRole.create({ data: { tenantId: workspace.id, ...r } });
    roleIds[r.slug] = row.id;
  }

  const delivery = await seedDelivery(workspace.id, roleIds);
  await seedSimple(workspace.id);
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { defaultWorkflowId: delivery.id },
  });

  const project = await prisma.project.create({
    data: {
      tenantId: workspace.id,
      name: opts.isInternal ? 'Website' : 'Client site',
      key: opts.isInternal ? 'WEB' : 'CLI',
      colour: '#178A5C',
      leadId: owner.id,
      workflowId: delivery.id,
    },
  });

  const section = await prisma.section.create({
    data: {
      tenantId: workspace.id,
      projectId: project.id,
      name: 'Inbox',
      position: 'a0',
    },
  });

  const approved = await prisma.workflowStatus.findFirstOrThrow({
    where: { tenantId: workspace.id, workflowId: delivery.id, slug: 'approved' },
  });
  const bugType = await prisma.taskType.findFirstOrThrow({
    where: { tenantId: workspace.id, slug: 'bug' },
  });

  await prisma.task.create({
    data: {
      tenantId: workspace.id,
      projectId: project.id,
      number: 1,
      title: opts.isInternal ? 'Seed task for internal workspace' : 'Seed task for client workspace',
      typeId: bugType.id,
      statusId: approved.id,
      sectionId: section.id,
      reporterId: owner.id,
      priority: 'none',
      position: 'a0',
    },
  });

  return { workspace, owner };
}

async function seedDelivery(tenantId: string, roleIds: Record<string, string>) {
  const wf = await prisma.workflow.create({
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
    const row = await prisma.workflowStatus.create({
      data: { tenantId, workflowId: wf.id, ...s },
    });
    ids[s.slug] = row.id;
  }

  const biz = [roleIds.business, roleIds.lead];
  const dev = [roleIds.developer, roleIds.lead];
  const tes = [roleIds.tester, roleIds.lead];
  const any: string[] = [];

  const moves: { from: string; to: string; roles: string[]; requireComment?: boolean; label?: string }[] = [
    { from: 'idea', to: 'approved', roles: biz, label: 'Approve' },
    { from: 'idea', to: 'rejected', roles: biz, requireComment: true, label: 'Reject' },
    { from: 'approved', to: 'wip', roles: dev },
    { from: 'wip', to: 'ready_for_testing', roles: dev },
    { from: 'ready_for_testing', to: 'testing', roles: tes },
    { from: 'testing', to: 'deployed', roles: tes, label: 'Pass' },
    { from: 'testing', to: 'wip', roles: tes, requireComment: true, label: 'Fail' },
    { from: 'idea', to: 'on_hold', roles: any },
    { from: 'approved', to: 'on_hold', roles: any },
    { from: 'wip', to: 'on_hold', roles: any },
    { from: 'ready_for_testing', to: 'on_hold', roles: any },
    { from: 'testing', to: 'on_hold', roles: any },
  ];

  for (const m of moves) {
    await prisma.workflowTransition.create({
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

async function seedSimple(tenantId: string) {
  const wf = await prisma.workflow.create({
    data: { tenantId, name: 'Simple', slug: 'simple', isDefault: false, isTemplate: true },
  });
  const specs: { slug: string; name: string; category: Prisma.WorkflowStatusCreateInput['category']; position: number }[] = [
    { slug: 'todo', name: 'To do', category: 'backlog', position: 0 },
    { slug: 'doing', name: 'Doing', category: 'active', position: 1 },
    { slug: 'done', name: 'Done', category: 'done', position: 2 },
  ];
  const ids: Record<string, string> = {};
  for (const s of specs) {
    const row = await prisma.workflowStatus.create({
      data: { tenantId, workflowId: wf.id, ...s },
    });
    ids[s.slug] = row.id;
  }
  for (const [from, to] of [['todo', 'doing'], ['doing', 'done'], ['done', 'todo'], ['doing', 'todo']] as const) {
    await prisma.workflowTransition.create({
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

async function main() {
  await seedWorkspace({
    slug: 'internal',
    name: 'BornTask',
    isInternal: true,
    ownerEmail: 'owner@borntask.com',
    ownerName: 'BornTask Owner',
  });
  await seedWorkspace({
    slug: 'acme',
    name: 'Acme',
    isInternal: false,
    ownerEmail: 'owner@acme.test',
    ownerName: 'Acme Owner',
  });
  console.log('Seeded workspaces: internal (is_internal), acme; Delivery + Simple workflows; roles; types.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
