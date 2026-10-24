import { prisma } from '../db.js';
import type { TenantClient } from '../tenantPrisma.js';

export async function applyProjectInvite(
  db: TenantClient,
  input: { tenantId: string; userId: string; projectId: string; projectRoleIds: unknown },
) {
  const member = await db.projectMember.upsert({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
    update: {},
    create: { tenantId: input.tenantId, projectId: input.projectId, userId: input.userId },
  });
  const roleIds = Array.isArray(input.projectRoleIds)
    ? input.projectRoleIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  for (const roleId of roleIds) {
    await db.projectMemberRole.upsert({
      where: { memberId_roleId: { memberId: member.id, roleId } },
      update: {},
      create: { tenantId: input.tenantId, memberId: member.id, roleId },
    });
  }
  return member;
}

export async function acceptProjectInvite(
  db: TenantClient,
  input: { tenantId: string; userId: string; invite: { id: string; projectId: string | null; projectRoleIds: unknown } },
) {
  if (!input.invite.projectId) return;
  await applyProjectInvite(db, {
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.invite.projectId,
    projectRoleIds: input.invite.projectRoleIds,
  });
  await prisma.invitation.update({
    where: { id: input.invite.id },
    data: { acceptedAt: new Date() },
  });
}
