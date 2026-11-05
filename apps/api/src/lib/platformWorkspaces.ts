import type { PrismaClient, TenantRole } from '@prisma/client';
import { originForSlug } from './workspaceHost.js';

function emptyRoleCounts(): Record<TenantRole, number> {
  return { owner: 0, admin: 0, member: 0, guest: 0, viewer: 0 };
}

function asDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export async function listPlatformWorkspaces(db: PrismaClient) {
  const now = new Date();
  const rows = await db.workspace.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      members: {
        where: { isActive: true },
        select: { tenantRole: true, user: { select: { name: true, email: true } } },
      },
      importJobs: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, createdAt: true, fileName: true } },
      activityLogs: { orderBy: { at: 'desc' }, take: 1, select: { at: true } },
      _count: {
        select: {
          projects: true,
          tasks: { where: { deletedAt: null } },
          invitations: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } },
        },
      },
    },
  });

  const openCounts = await db.task.groupBy({
    by: ['tenantId'],
    where: { deletedAt: null, completedAt: null },
    _count: { _all: true },
  });
  const openByTenant = new Map(openCounts.map((row) => [row.tenantId, row._count._all]));

  return rows.map((ws) => {
    const roleCounts = emptyRoleCounts();
    let ownerName: string | null = null;
    let ownerEmail: string | null = null;
    for (const member of ws.members) {
      roleCounts[member.tenantRole] += 1;
      if (member.tenantRole === 'owner' && !ownerEmail) {
        ownerName = member.user.name;
        ownerEmail = member.user.email;
      }
    }
    const lastImport = ws.importJobs[0];
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      url: originForSlug(ws.slug),
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
      ownerName,
      ownerEmail,
      memberCount: ws.members.length,
      roleCounts,
      projectCount: ws._count.projects,
      taskCount: ws._count.tasks,
      openTaskCount: openByTenant.get(ws.id) ?? 0,
      lastActivityAt: ws.activityLogs[0]?.at.toISOString() ?? null,
      invitationCount: ws._count.invitations,
      lastImport: lastImport
        ? { status: lastImport.status, createdAt: lastImport.createdAt.toISOString(), fileName: lastImport.fileName }
        : null,
      isInternal: ws.isInternal,
      allowGoogle: ws.allowGoogle,
      allowMicrosoft: ws.allowMicrosoft,
      allowedDomains: asDomains(ws.allowedDomains),
    };
  });
}
