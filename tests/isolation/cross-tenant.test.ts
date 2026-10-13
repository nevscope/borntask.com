import { afterAll, beforeAll, expect, test } from 'vitest';
import { createTenantClient, prisma } from '../../apps/api/src/tenantPrisma.ts';

/**
 * If tenant scoping is dropped, tenant B will see tenant A's task and this file must fail.
 */
let tenantA = '';
let tenantB = '';
let taskAId = '';

beforeAll(async () => {
  const a = await prisma.workspace.findUnique({ where: { slug: 'internal' } });
  const b = await prisma.workspace.findUnique({ where: { slug: 'acme' } });
  if (!a || !b) {
    throw new Error('Run npm run db:seed before isolation tests (workspaces internal + acme).');
  }
  tenantA = a.id;
  tenantB = b.id;
  const task = await prisma.task.findFirst({ where: { tenantId: tenantA } });
  if (!task) throw new Error('Seed did not create a task in workspace internal.');
  taskAId = task.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

test('scoped client for tenant B cannot list tenant A tasks', async () => {
  const clientB = createTenantClient(tenantB);
  const rows = await clientB.task.findMany();
  expect(rows.every((t) => t.tenantId === tenantB)).toBe(true);
  expect(rows.some((t) => t.id === taskAId)).toBe(false);
});

test('findUnique of another tenant task returns null', async () => {
  const clientB = createTenantClient(tenantB);
  const stolen = await clientB.task.findUnique({ where: { id: taskAId } });
  expect(stolen).toBeNull();
});

test('where tenantId: A is still clamped to B', async () => {
  const clientB = createTenantClient(tenantB);
  const rows = await clientB.task.findMany({
    where: { tenantId: tenantA },
  });
  expect(rows).toHaveLength(0);
});

test('create injects caller tenantId and cannot write into tenant A', async () => {
  const clientB = createTenantClient(tenantB);
  const project = await prisma.project.findFirstOrThrow({ where: { tenantId: tenantB } });
  const section = await prisma.section.findFirstOrThrow({ where: { tenantId: tenantB, projectId: project.id } });
  const type = await prisma.taskType.findFirstOrThrow({ where: { tenantId: tenantB, slug: 'bug' } });
  const status = await prisma.workflowStatus.findFirstOrThrow({
    where: { tenantId: tenantB, slug: 'approved' },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@acme.test' } });

  const created = await clientB.task.create({
    data: {
      tenantId: tenantA,
      projectId: project.id,
      number: 9001,
      title: 'Isolation probe',
      typeId: type.id,
      statusId: status.id,
      sectionId: section.id,
      reporterId: owner.id,
      position: 'z9',
    },
  });

  expect(created.tenantId).toBe(tenantB);
  await prisma.task.delete({ where: { id: created.id } });
});
