import { z } from 'zod';
import type { Authed } from '../context.js';
import { forbidden, notFound, validation } from '../errors.js';
import { slugify } from './tokens.js';

function requireOwnerAdmin(auth: Authed) {
  if (auth.workspaceRole !== 'owner' && auth.workspaceRole !== 'admin') {
    throw forbidden('Owners and admins only.');
  }
}

export const colourSchema = z
  .string()
  .trim()
  .regex(/^#?[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/, 'Choose a colour as #RGB or #RRGGBB.')
  .transform((value) => {
    const h = value.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return `#${full.toUpperCase()}`;
  });

export function uniqueSlug(base: string, taken: Set<string>) {
  let slug = slugify(base) || 'item';
  if (!taken.has(slug)) return slug;
  slug = `${slug.slice(0, 24)}-${Math.random().toString(36).slice(2, 6)}`;
  return slug;
}

export async function patchRole(auth: Authed, id: string, input: { name?: string; colour?: string }) {
  requireOwnerAdmin(auth);
  const row = await auth.db.projectRole.findFirst({ where: { id } });
  if (!row) throw notFound('Role not found.');
  await auth.db.projectRole.updateMany({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.colour ? { colour: input.colour } : {}),
    },
  });
  return auth.db.projectRole.findFirstOrThrow({ where: { id } });
}

export async function deleteRole(auth: Authed, id: string) {
  requireOwnerAdmin(auth);
  const row = await auth.db.projectRole.findFirst({ where: { id } });
  if (!row) throw notFound('Role not found.');
  if (row.slug === 'lead') throw validation('Every project needs the lead role.');
  const remaining = await auth.db.projectRole.count();
  if (remaining < 2) throw validation('Keep at least one project role.');
  const used = await auth.db.projectMemberRole.count({ where: { roleId: id } });
  if (used > 0) {
    throw validation(`This role is still on ${used} ${used === 1 ? 'person' : 'people'}. Remove it there first.`);
  }
  const moves = await auth.db.workflowTransition.findMany({ select: { allowedRoleIds: true } });
  const inMoves = moves.filter((move) => Array.isArray(move.allowedRoleIds) && move.allowedRoleIds.includes(id)).length;
  if (inMoves > 0) throw validation('This role is used on workflow moves. Remove it from those moves first.');
  await auth.db.projectRole.deleteMany({ where: { id } });
  return { ok: true as const };
}

export async function patchType(auth: Authed, id: string, input: { name?: string; colour?: string; template?: string | null }) {
  requireOwnerAdmin(auth);
  const row = await auth.db.taskType.findFirst({ where: { id } });
  if (!row) throw notFound('Type not found.');
  await auth.db.taskType.updateMany({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.colour ? { colour: input.colour } : {}),
      ...(input.template !== undefined ? { template: input.template?.trim() || null } : {}),
    },
  });
  return auth.db.taskType.findFirstOrThrow({ where: { id } });
}

export async function deleteType(auth: Authed, id: string) {
  requireOwnerAdmin(auth);
  const row = await auth.db.taskType.findFirst({ where: { id } });
  if (!row) throw notFound('Type not found.');
  const remaining = await auth.db.taskType.count();
  if (remaining < 2) throw validation('Keep at least one task type.');
  const used = await auth.db.task.count({ where: { typeId: id, deletedAt: null } });
  if (used > 0) {
    throw validation(`This type is still on ${used} ${used === 1 ? 'task' : 'tasks'}. Change those tasks first.`);
  }
  await auth.db.taskType.deleteMany({ where: { id } });
  return { ok: true as const };
}

export async function deleteWorkflow(auth: Authed, id: string) {
  requireOwnerAdmin(auth);
  const row = await auth.db.workflow.findFirst({ where: { id } });
  if (!row) throw notFound('Workflow not found.');
  const remaining = await auth.db.workflow.count();
  if (remaining < 2) throw validation('Keep at least one workflow.');
  const used = await auth.db.project.count({ where: { workflowId: id } });
  if (used > 0) {
    throw validation(`This workflow is used by ${used} ${used === 1 ? 'project' : 'projects'}. Switch those projects first.`);
  }
  const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
  if (ws?.defaultWorkflowId === id) {
    const next = await auth.db.workflow.findFirst({ where: { id: { not: id } }, orderBy: { name: 'asc' } });
    await auth.db.workspace.update({
      where: { id: auth.tenantId },
      data: { defaultWorkflowId: next?.id ?? null },
    });
  }
  await auth.db.workflowTransition.deleteMany({ where: { workflowId: id } });
  await auth.db.workflowStatus.deleteMany({ where: { workflowId: id } });
  await auth.db.workflow.deleteMany({ where: { id } });
  return { ok: true as const };
}
