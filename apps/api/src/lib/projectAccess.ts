import { forbidden, notFound } from '../errors.js';
import type { Authed } from '../context.js';

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

/** Admins may list other projects so they can request access. Members and guests may not. */
export function canDiscoverWorkspaceProjects(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export async function requireOpenProject(auth: Authed, key: string) {
  const project = await auth.db.project.findFirst({ where: { key } });
  if (!project) throw notFound('Project not found.');
  if (auth.workspaceRole === 'owner') return project;
  const on = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId: auth.userId } });
  if (on || project.leadId === auth.userId) return project;
  throw forbidden("You're not on this project.");
}
