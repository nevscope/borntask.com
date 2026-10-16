import type { Authed } from '../context.js';
import { validation } from '../errors.js';

export type StageRef = {
  id: string;
  slug: string;
  name: string;
  category: string;
  position: number;
};

function sameStage(stage: StageRef, from: { slug: string; name?: string }) {
  if (stage.slug === from.slug) return true;
  const left = stage.name.trim().toLowerCase();
  const right = from.name?.trim().toLowerCase();
  return Boolean(right) && left === right;
}

/** Map a task stage onto another workflow. Same stage wins, then the same group, then the first stage. */
export function mapStage(target: StageRef[], from: { slug: string; name?: string; category: string }): StageRef | null {
  const ordered = [...target].sort((a, b) => a.position - b.position);
  if (!ordered.length) return null;
  const same = ordered.find((stage) => sameStage(stage, from));
  if (same) return same;
  const category = ordered.find((stage) => stage.category === from.category);
  if (category) return category;
  if (from.category === 'review') {
    const active = ordered.find((stage) => stage.category === 'active');
    if (active) return active;
  }
  return ordered[0] ?? null;
}

export function mapPreviousStage(target: StageRef[], slug: string | null | undefined): string | null {
  if (!slug) return null;
  return target.find((stage) => stage.slug === slug)?.id ?? null;
}

export async function switchProjectWorkflow(auth: Authed, projectId: string, workflowId: string) {
  const next = await auth.db.workflow.findFirst({
    where: { id: workflowId },
    include: { statuses: true },
  });
  if (!next) throw validation('Choose a workflow in this workspace.');
  const target: StageRef[] = next.statuses.map((stage) => ({
    id: stage.id,
    slug: stage.slug,
    name: stage.name,
    category: stage.category,
    position: stage.position,
  }));
  if (!target.length) throw validation('That workflow has no stages.');

  await auth.db.project.update({
    where: { id: projectId },
    data: { workflowId: next.id },
  });

  const tasks = await auth.db.task.findMany({
    where: { projectId },
    select: {
      id: true,
      completedAt: true,
      previousStatusId: true,
      status: { select: { id: true, slug: true, name: true, category: true } },
      previousStatus: { select: { slug: true } },
    },
  });

  const groups = new Map<string, { statusId: string; previousStatusId: string | null; done: boolean; ids: string[]; fillCompleted: string[] }>();
  for (const task of tasks) {
    const mapped = mapStage(target, task.status);
    if (!mapped) continue;
    const previousStatusId = mapPreviousStage(target, task.previousStatus?.slug);
    const done = mapped.category === 'done';
    const unchanged = mapped.id === task.status.id
      && (task.previousStatusId ?? null) === previousStatusId
      && (done ? task.completedAt !== null : task.completedAt === null);
    if (unchanged) continue;
    const key = `${mapped.id}|${previousStatusId ?? ''}|${done ? 'done' : 'open'}`;
    const group = groups.get(key) ?? { statusId: mapped.id, previousStatusId, done, ids: [], fillCompleted: [] };
    group.ids.push(task.id);
    if (done && !task.completedAt) group.fillCompleted.push(task.id);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    await auth.db.task.updateMany({
      where: { id: { in: group.ids } },
      data: {
        statusId: group.statusId,
        previousStatusId: group.previousStatusId,
        ...(group.done ? {} : { completedAt: null }),
      },
    });
    if (group.fillCompleted.length) {
      await auth.db.task.updateMany({
        where: { id: { in: group.fillCompleted }, completedAt: null },
        data: { completedAt: new Date() },
      });
    }
  }

  return { workflowId: next.id, name: next.name };
}
