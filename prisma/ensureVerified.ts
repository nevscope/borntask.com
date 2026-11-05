import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** BOR-64: Deployed is checking on live (review). Verified is the done stage. */
export async function ensureVerifiedStage(tenantId?: string) {
  const workflows = await prisma.workflow.findMany({
    where: { slug: 'delivery', ...(tenantId ? { tenantId } : {}) },
    include: { statuses: true, transitions: true },
  });

  for (const wf of workflows) {
    const bySlug = new Map(wf.statuses.map((row) => [row.slug, row]));
    const deployed = bySlug.get('deployed');
    if (!deployed) continue;

    if (deployed.category === 'done') {
      await prisma.workflowStatus.update({
        where: { id: deployed.id },
        data: { category: 'review' },
      });
    }

    let verified = bySlug.get('verified');
    if (!verified) {
      verified = await prisma.workflowStatus.create({
        data: {
          tenantId: wf.tenantId,
          workflowId: wf.id,
          slug: 'verified',
          name: 'Verified',
          category: 'done',
          position: (deployed.position ?? 5) + 1,
        },
      });
    }

    const testerRoles = new Set<string>();
    for (const move of wf.transitions) {
      const roles = Array.isArray(move.allowedRoleIds) ? move.allowedRoleIds : [];
      if (move.toStatusId === deployed.id) {
        for (const role of roles) if (typeof role === 'string') testerRoles.add(role);
      }
    }
    const tes = [...testerRoles];
    const has = (fromId: string, toId: string) =>
      wf.transitions.some((row) => row.fromStatusId === fromId && row.toStatusId === toId);

    if (!has(deployed.id, verified.id)) {
      await prisma.workflowTransition.create({
        data: {
          tenantId: wf.tenantId,
          workflowId: wf.id,
          fromStatusId: deployed.id,
          toStatusId: verified.id,
          allowedRoleIds: tes,
          label: 'Checked on live',
          notifyAssignee: true,
        },
      });
    }

    const wip = bySlug.get('wip');
    if (wip && !has(deployed.id, wip.id)) {
      await prisma.workflowTransition.create({
        data: {
          tenantId: wf.tenantId,
          workflowId: wf.id,
          fromStatusId: deployed.id,
          toStatusId: wip.id,
          allowedRoleIds: tes,
          requireComment: true,
          label: 'Reopen',
          notifyAssignee: true,
        },
      });
    }
  }
}

if (process.argv[1]?.includes('ensureVerified')) {
  ensureVerifiedStage()
    .then(() => prisma.$disconnect())
    .catch((error) => {
      console.error(error);
      return prisma.$disconnect().finally(() => process.exit(1));
    });
}
