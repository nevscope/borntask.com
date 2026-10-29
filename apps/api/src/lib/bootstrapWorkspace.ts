import type { PrismaClient } from '@prisma/client';
import { PLANNING_TYPES, workspacePackById, type WorkspacePack, type WorkspacePackId } from '@borntask/shared';
import type { TenantClient } from '../tenantPrisma.js';
import { colourForCategory } from './mappers.js';

type Db = PrismaClient | TenantClient;

export async function bootstrapWorkspaceDefaults(db: Db, tenantId: string, packId?: WorkspacePackId | string) {
  const pack = workspacePackById(packId);
  const roleIds: Record<string, string> = {};
  for (const role of pack.roles) {
    const row = await db.projectRole.create({
      data: { tenantId, slug: role.slug, name: role.name, colour: role.colour },
    });
    roleIds[role.slug] = row.id;
  }
  const types = [...pack.types];
  for (const extra of PLANNING_TYPES) {
    if (!types.some((type) => type.slug === extra.slug)) types.push({ ...extra });
  }
  for (const type of types) {
    await db.taskType.create({
      data: {
        tenantId,
        slug: type.slug,
        name: type.name,
        colour: type.colour,
        template: type.template,
      },
    });
  }

  let defaultId: string | null = null;
  for (const workflow of pack.workflows) {
    const row = await seedPackWorkflow(db, tenantId, workflow, roleIds);
    if (workflow.isDefault) defaultId = row.id;
  }
  if (!defaultId) defaultId = (await db.workflow.findFirst({ where: { tenantId }, orderBy: { name: 'asc' } }))?.id ?? null;
  await db.workspace.update({
    where: { id: tenantId },
    data: { defaultWorkflowId: defaultId },
  });
  return { deliveryId: defaultId, roleIds, packId: pack.id };
}

async function seedPackWorkflow(
  db: Db,
  tenantId: string,
  workflow: WorkspacePack['workflows'][number],
  roleIds: Record<string, string>,
) {
  const wf = await db.workflow.create({
    data: {
      tenantId,
      name: workflow.name,
      slug: workflow.slug,
      isDefault: workflow.isDefault,
      isTemplate: true,
    },
  });
  const ids: Record<string, string> = {};
  for (const stage of workflow.stages) {
    const row = await db.workflowStatus.create({
      data: {
        tenantId,
        workflowId: wf.id,
        slug: stage.slug,
        name: stage.name,
        category: stage.category,
        position: stage.position,
        colour: colourForCategory(stage.category),
      },
    });
    ids[stage.slug] = row.id;
  }
  for (const move of workflow.moves) {
    const fromId = ids[move.from];
    const toId = ids[move.to];
    if (!fromId || !toId) continue;
    await db.workflowTransition.create({
      data: {
        tenantId,
        workflowId: wf.id,
        fromStatusId: fromId,
        toStatusId: toId,
        allowedRoleIds: move.roles.map((slug) => roleIds[slug]).filter((id): id is string => !!id),
        requireComment: move.requireComment ?? false,
        label: move.label,
        notifyAssignee: true,
      },
    });
  }
  return wf;
}

export async function createOpenWorkflow(db: Db, tenantId: string, name: string) {
  const pack = workspacePackById('simple');
  const simple = pack.workflows[0];
  if (!simple) throw new Error('Simple workflow template is missing.');
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'workflow';
  let slug = base;
  const clash = await db.workflow.findFirst({ where: { tenantId, slug } });
  if (clash) slug = `${base.slice(0, 24)}-${Math.random().toString(36).slice(2, 6)}`;
  const roles = await db.projectRole.findMany();
  const roleIds = Object.fromEntries(roles.map((role) => [role.slug, role.id]));
  return seedPackWorkflow(db, tenantId, { ...simple, name, slug, isDefault: false }, roleIds);
}
