import { normaliseProjectKey } from '@borntask/shared';
import { prisma } from '../db.js';
import { forbidden, notFound } from '../errors.js';
import type { Authed } from '../context.js';

export async function pendingInviteProjectIds(auth: Authed): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } });
  if (!user) return [];
  const invites = await auth.db.invitation.findMany({
    where: {
      email: user.email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      projectId: { not: null },
    },
    select: { projectId: true },
  });
  return invites.map((row) => row.projectId).filter((id): id is string => Boolean(id));
}

export async function findPendingProjectInvite(auth: Authed, projectId: string) {
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } });
  if (!user) return null;
  return auth.db.invitation.findFirst({
    where: {
      email: user.email.toLowerCase(),
      projectId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

/** Owner sees every project. Everyone else needs a seat (member or lead). */
export async function openProjectIds(auth: Authed): Promise<Set<string> | null> {
  if (auth.workspaceRole === 'owner') return null;
  const [members, led] = await Promise.all([
    auth.db.projectMember.findMany({ where: { userId: auth.userId }, select: { projectId: true } }),
    auth.db.project.findMany({ where: { leadId: auth.userId }, select: { id: true } }),
  ]);
  return new Set([...members.map((m) => m.projectId), ...led.map((p) => p.id)]);
}

export function canOpenListed(openIds: Set<string> | null, projectId: string): boolean {
  return openIds === null || openIds.has(projectId);
}

/** Workspace people may list locked projects so they can request access. Guests only see seats they already have. */
export function canDiscoverWorkspaceProjects(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer';
}

export async function requireOpenProject(auth: Authed, key: string) {
  const project = await auth.db.project.findFirst({ where: { key: normaliseProjectKey(key) } });
  if (!project) throw notFound('Project not found.');
  if (auth.workspaceRole === 'owner') return project;
  const on = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId: auth.userId } });
  if (on || project.leadId === auth.userId) return project;
  if (await findPendingProjectInvite(auth, project.id)) return project;
  throw forbidden("You're not on this project.");
}

/** Viewers may open a project they have a seat on, but cannot change tasks or settings. */
export function requireProjectWrite(auth: Authed) {
  if (auth.workspaceRole === 'viewer') {
    throw forbidden('Viewers can look at this project but cannot change it.');
  }
}

export async function requireOpenProjectWrite(auth: Authed, key: string) {
  const project = await requireOpenProject(auth, key);
  requireProjectWrite(auth);
  const pending = await findPendingProjectInvite(auth, project.id);
  if (pending) {
    const member = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId: auth.userId } });
    if (!member && project.leadId !== auth.userId && auth.workspaceRole !== 'owner') {
      throw forbidden('Accept the invitation before changing this project.');
    }
  }
  return project;
}

/** Owner, admin who can already open the project, or the project lead. */
export async function assertCanManageOpenProject(
  auth: Authed,
  project: { id: string; leadId: string | null },
  message = 'Only a project lead or workspace admin can change this.',
) {
  if (auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin' || project.leadId === auth.userId) return;
  const member = await auth.db.projectMember.findFirst({
    where: { projectId: project.id, userId: auth.userId },
    include: { roles: { include: { role: true } } },
  });
  if (member?.roles.some((role) => role.role.slug === 'lead')) return;
  throw forbidden(message);
}
