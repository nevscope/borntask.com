import { PLANNING_TYPES, isPlanningType, planningParentAllowed, planningTypeAllowed, type WorkBreakdown } from '@borntask/shared';
import { validation } from '../errors.js';
import type { TenantClient } from '../tenantPrisma.js';

export async function ensurePlanningTypes(db: TenantClient, tenantId: string) {
  for (const type of PLANNING_TYPES) {
    const existing = await db.taskType.findFirst({ where: { slug: type.slug } });
    if (existing) continue;
    await db.taskType.create({
      data: { tenantId, slug: type.slug, name: type.name, colour: type.colour, template: type.template },
    });
  }
}

export async function resolvePlanningParent(
  db: TenantClient,
  project: { id: string; workBreakdown: WorkBreakdown | string },
  childSlug: string,
  planningParentId: string | null | undefined,
  childId?: string,
) {
  if (!planningTypeAllowed(project.workBreakdown, childSlug)) {
    throw validation(childSlug === 'epic' || childSlug === 'story'
      ? 'Turn on work breakdown for this project to use that type.'
      : 'This project does not use that task type.');
  }
  if (!planningParentId) return null;
  const parent = await db.task.findFirst({
    where: { id: planningParentId, projectId: project.id, deletedAt: null, parentId: null },
    include: { type: true },
  });
  if (!parent) throw validation('That story or epic is not on this project.');
  if (childId && parent.id === childId) throw validation('A task cannot be part of itself.');
  if (childId && parent.planningParentId === childId) throw validation('That would create a loop.');
  if (!planningParentAllowed(project.workBreakdown, childSlug, parent.type.slug)) {
    if (childSlug === 'story') throw validation('A story can only sit under an epic.');
    if (isPlanningType(parent.type.slug)) throw validation('That parent is not a story or epic.');
    throw validation('Work items sit under a story, or an epic.');
  }
  return parent.id;
}
