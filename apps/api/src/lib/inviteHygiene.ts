import { prisma } from '../db.js';
import type { TenantClient } from '../tenantPrisma.js';
import { acceptProjectInvite } from './applyProjectInvite.js';
import { enqueueMail, roleLabel } from './enqueueMail.js';
import { newInviteToken } from './tokens.js';
import { originForSlug } from './workspaceHost.js';

export async function revokeExpiredPendingInvites(db: TenantClient) {
  return db.invitation.updateMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { lt: new Date() },
    },
    data: { revokedAt: new Date() },
  });
}

export async function findPendingInvite(
  db: TenantClient,
  input: { email: string; projectId?: string | null },
) {
  return db.invitation.findFirst({
    where: {
      email: input.email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      projectId: input.projectId ?? null,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Grant unexpired leftover project seats, then revoke any other pending rows for that email. */
export async function settlePendingInvitesForEmail(
  db: TenantClient,
  input: { tenantId: string; userId: string; email: string; keepId?: string },
) {
  const email = input.email.toLowerCase();
  const now = new Date();
  const leftover = await db.invitation.findMany({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      ...(input.keepId ? { id: { not: input.keepId } } : {}),
    },
  });
  for (const invite of leftover) {
    if (invite.projectId && invite.expiresAt.getTime() >= now.getTime()) {
      await acceptProjectInvite(db, { tenantId: input.tenantId, userId: input.userId, invite });
    } else {
      await db.invitation.update({
        where: { id: invite.id },
        data: { revokedAt: now },
      });
    }
  }
}

export async function resendInviteRow(
  db: TenantClient,
  tenantId: string,
  invite: {
    id: string;
    email: string;
    tenantRole: string;
    projectId: string | null;
    projectRoleIds: unknown;
    message: string | null;
  },
  actorName: string,
) {
  const { token, hash } = newInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.invitation.update({
    where: { id: invite.id },
    data: { tokenHash: hash, expiresAt },
  });
  await db.invitation.updateMany({
    where: {
      email: invite.email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      projectId: invite.projectId,
      id: { not: invite.id },
    },
    data: { revokedAt: new Date() },
  });
  const ws = await db.workspace.findUnique({ where: { id: tenantId } });
  const url = `${originForSlug(ws?.slug)}/invite/${token}`;
  const roleIds = Array.isArray(invite.projectRoleIds) ? (invite.projectRoleIds as string[]) : [];
  const role = roleIds[0] ? await db.projectRole.findFirst({ where: { id: roleIds[0] } }) : null;
  await enqueueMail({
    kind: 'invite',
    to: invite.email,
    inviteUrl: url,
    workspaceName: ws?.name ?? 'BornTask',
    inviterName: actorName,
    roleLabel: roleLabel(invite.tenantRole, role?.name),
    message: invite.message,
    expiresAt: expiresAt.toISOString(),
  });
  return { email: invite.email, url, tenantRole: invite.tenantRole, expiresAt };
}

export async function activeMemberForEmail(tenantId: string, email: string) {
  const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
  if (!user) return null;
  const seat = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
  });
  if (!seat?.isActive) return null;
  return { user, seat };
}
