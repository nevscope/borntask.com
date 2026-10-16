import type { Authed } from '../context.js';
import { forbidden, notFound, validation } from '../errors.js';
import { colourSchema } from './adminCatalog.js';
import { colourForCategory } from './mappers.js';
import { loadWorkflow, workflowView } from './loadProject.js';

const categorySchema = ['backlog', 'active', 'review', 'done'] as const;
type Category = (typeof categorySchema)[number];

export type StageInput = {
  id: string;
  name: string;
  category: Category;
  colour?: string | null;
  wipLimit: number | null;
};

export type TransitionInput = {
  from: string;
  to: string;
  roles: string[];
  requireComment: boolean;
  label?: string | null;
};

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return base || 'stage';
}

function isCategory(value: string): value is Category {
  return (categorySchema as readonly string[]).includes(value);
}

export async function saveWorkflowDefinition(
  auth: Authed,
  workflowId: string,
  input: {
    name?: string;
    statuses?: StageInput[];
    remaps?: { from: string; to: string }[];
    transitions: TransitionInput[];
  },
) {
  if (auth.workspaceRole !== 'owner' && auth.workspaceRole !== 'admin') {
    throw forbidden('Only the owner or an admin can edit workflows.');
  }
  const existing = await auth.db.workflow.findFirst({ where: { id: workflowId } });
  if (!existing) throw notFound('Workflow not found.');
  if (input.name) {
    await auth.db.workflow.updateMany({ where: { id: workflowId }, data: { name: input.name } });
  }
  if (input.statuses) {
    await replaceStages(auth, workflowId, input.statuses, input.remaps ?? []);
  }
  await replaceTransitions(auth, workflowId, input.transitions);
  return workflowView(auth.db, workflowId);
}

async function replaceStages(
  auth: Authed,
  workflowId: string,
  statuses: StageInput[],
  remaps: { from: string; to: string }[],
) {
  if (statuses.length < 1) throw validation('A workflow needs at least one stage.');
  for (const s of statuses) {
    if (!s.name.trim()) throw validation('Every stage needs a name.');
    if (!isCategory(s.category)) throw validation(`Choose a category for ${s.name}.`);
  }
  const current = await loadWorkflow(auth.db, workflowId);
  const incoming = statuses.map((s, position) => ({ ...s, name: s.name.trim(), position }));
  const ids = incoming.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw validation('Stage ids must be unique.');

  const kept = new Set(incoming.filter((s) => !s.id.startsWith('new:')).map((s) => s.id));
  for (const id of kept) {
    if (!current.statusIdBySlug[id]) throw validation(`Unknown stage ${id}.`);
  }
  const removed = current.statuses.filter((s) => !kept.has(s.id));

  for (const stage of removed) {
    const dbId = current.statusIdBySlug[stage.id];
    if (!dbId) continue;
    const living = await auth.db.task.count({ where: { statusId: dbId, deletedAt: null } });
    const any = await auth.db.task.count({ where: { statusId: dbId } });
    const remap = remaps.find((r) => r.from === stage.id);
    if (any > 0) {
      if (!remap?.to || !kept.has(remap.to)) {
        const n = living || any;
        throw validation(`Move the ${n} ${n === 1 ? 'task' : 'tasks'} on ${stage.name} to a stage you are keeping.`);
      }
      if (remap.to === stage.id) throw validation(`Tasks on ${stage.name} have to move to a different stage.`);
    }
  }

  await auth.db.workflowTransition.deleteMany({ where: { workflowId } });

  for (const stage of incoming) {
    if (stage.id.startsWith('new:')) continue;
    const dbId = current.statusIdBySlug[stage.id];
    if (!dbId) continue;
    await auth.db.workflowStatus.updateMany({
      where: { id: dbId },
      data: {
        name: stage.name,
        category: stage.category,
        colour: parseColour(stage.colour) ?? colourForCategory(stage.category),
        position: stage.position,
        wipLimit: stage.wipLimit,
      },
    });
  }

  const used = new Set(kept);
  for (const stage of incoming) {
    if (!stage.id.startsWith('new:')) continue;
    let slug = slugify(stage.name);
    let n = 2;
    while (used.has(slug)) {
      slug = `${slugify(stage.name).slice(0, 24)}_${n}`;
      n += 1;
    }
    used.add(slug);
    await auth.db.workflowStatus.create({
      data: {
        tenantId: auth.tenantId,
        workflowId,
        slug,
        name: stage.name,
        category: stage.category,
        colour: parseColour(stage.colour) ?? colourForCategory(stage.category),
        position: stage.position,
        wipLimit: stage.wipLimit,
      },
    });
  }

  for (const stage of removed) {
    const fromDb = current.statusIdBySlug[stage.id];
    if (!fromDb) continue;
    const remap = remaps.find((r) => r.from === stage.id);
    const to = remap
      ? await auth.db.workflowStatus.findFirst({ where: { workflowId, slug: remap.to } })
      : null;
    const holding = await auth.db.task.count({ where: { statusId: fromDb } });
    if (holding > 0) {
      if (!to) throw validation(`Choose a stage that is staying to receive tasks from ${stage.name}.`);
      const moving = await auth.db.task.findMany({ where: { statusId: fromDb }, select: { id: true } });
      await auth.db.task.updateMany({ where: { statusId: fromDb }, data: { statusId: to.id } });
      if (moving.length) {
        await auth.db.activityLog.createMany({
          data: moving.map((t) => ({
            tenantId: auth.tenantId,
            taskId: t.id,
            actorId: auth.userId,
            actorType: 'user' as const,
            via: 'app' as const,
            action: `moved to ${to.slug} because ${stage.name} was removed`,
            fromJson: { status: stage.id },
            toJson: { status: to.slug },
          })),
        });
      }
    }
    const previousTarget = to
      ?? await auth.db.workflowStatus.findFirst({ where: { workflowId, slug: { not: stage.id } } });
    const previousCount = await auth.db.task.count({ where: { previousStatusId: fromDb } });
    if (previousCount > 0) {
      if (!previousTarget) throw validation(`Keep a stage so tasks can leave ${stage.name}.`);
      await auth.db.task.updateMany({ where: { previousStatusId: fromDb }, data: { previousStatusId: previousTarget.id } });
    }
    await auth.db.workflowStatus.deleteMany({ where: { id: fromDb } });
  }
}

function parseColour(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = colourSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function replaceTransitions(auth: Authed, workflowId: string, transitions: TransitionInput[]) {
  const wf = await loadWorkflow(auth.db, workflowId);
  const roles = await auth.db.projectRole.findMany();
  const roleIdBySlug = Object.fromEntries(roles.map((r) => [r.slug, r.id]));
  await auth.db.workflowTransition.deleteMany({ where: { workflowId } });
  for (const t of transitions) {
    const fromSlugs = t.from === '*'
      ? wf.statuses.filter((s) => s.category !== 'done' && s.id !== t.to).map((s) => s.id)
      : [t.from];
    const toId = wf.statusIdBySlug[t.to];
    if (!toId) continue;
    for (const fromSlug of fromSlugs) {
      const fromId = wf.statusIdBySlug[fromSlug];
      if (!fromId || fromId === toId) continue;
      await auth.db.workflowTransition.create({
        data: {
          tenantId: auth.tenantId,
          workflowId,
          fromStatusId: fromId,
          toStatusId: toId,
          allowedRoleIds: t.roles.map((s) => roleIdBySlug[s]).filter((x): x is string => !!x),
          requireComment: t.requireComment,
          label: t.label ?? null,
        },
      });
    }
  }
}
