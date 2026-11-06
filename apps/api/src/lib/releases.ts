import { calendarDayInZone, formatYmd, isReleaseReleased, summariseReleaseProgress } from '@borntask/shared';
import type { Authed } from '../context.js';
import { forbidden, notFound, validation } from '../errors.js';
import { openProjectIds } from './projectAccess.js';
import { ymdOf } from './timesheets.js';

type TaskRow = {
  id: string;
  number: number;
  title: string;
  project: { id: string; key: string; name: string };
  status: { slug: string; name: string; category: 'backlog' | 'active' | 'review' | 'done' };
};

export function canManageReleases(role: Authed['workspaceRole'], via: Authed['via']) {
  if (via === 'mcp') return false;
  return role === 'owner' || role === 'admin' || role === 'member';
}

export function requireManageReleases(auth: Authed) {
  if (auth.via === 'mcp') throw forbidden('MCP cannot change settings.');
  if (!canManageReleases(auth.workspaceRole, auth.via)) {
    throw forbidden('Guests and viewers cannot manage releases.');
  }
}

async function todayIso(auth: Authed) {
  const workspace = await auth.db.workspace.findUnique({ where: { id: auth.tenantId }, select: { timeZone: true } });
  return formatYmd(calendarDayInZone(new Date(), workspace?.timeZone ?? 'UTC'));
}

async function visibleProjectIds(auth: Authed, projectKey?: string) {
  const openIds = await openProjectIds(auth);
  if (!projectKey) return openIds;
  const project = await auth.db.project.findFirst({ where: { key: projectKey } });
  if (!project) throw notFound('Project not found.');
  if (openIds && !openIds.has(project.id)) throw forbidden('You cannot open that project.');
  return new Set([project.id]);
}

function sliceOf(row: TaskRow) {
  return {
    key: `${row.project.key}-${row.number}`,
    title: row.title,
    projectKey: row.project.key,
    projectName: row.project.name,
    statusId: row.status.slug,
    statusName: row.status.name,
    statusCategory: row.status.category,
  };
}

function pack(release: { id: string; name: string; date: Date }, tasks: TaskRow[], today: string) {
  const slices = tasks.map(sliceOf);
  const progress = summariseReleaseProgress(slices);
  const released = isReleaseReleased(ymdOf(release.date), today);
  const projects = [...new Map(tasks.map((row) => [row.project.key, { key: row.project.key, name: row.project.name }])).values()]
    .map((project) => ({
      ...project,
      count: tasks.filter((row) => row.project.key === project.key).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  return {
    id: release.id,
    name: release.name,
    date: ymdOf(release.date),
    released,
    taskCount: progress.total,
    projectCount: projects.length,
    progress,
    projects,
    tasks: slices,
    shipped: released ? slices.filter((task) => task.statusCategory === 'done') : [],
  };
}

async function tasksForRelease(auth: Authed, releaseId: string, projectIds: Set<string> | null) {
  return auth.db.task.findMany({
    where: {
      releaseId,
      deletedAt: null,
      parentId: null,
      ...(projectIds ? { projectId: { in: [...projectIds] } } : {}),
    },
    include: {
      project: { select: { id: true, key: true, name: true } },
      status: { select: { slug: true, name: true, category: true } },
    },
    orderBy: [{ project: { key: 'asc' } }, { number: 'asc' }],
  });
}

export async function listReleases(auth: Authed, projectKey?: string) {
  const projectIds = await visibleProjectIds(auth, projectKey);
  const today = await todayIso(auth);
  const releases = await auth.db.release.findMany({ orderBy: [{ date: 'desc' }, { name: 'asc' }] });
  const packed = await Promise.all(releases.map(async (release) => {
    const tasks = await tasksForRelease(auth, release.id, projectIds);
    return pack(release, tasks, today);
  }));
  return { releases: packed };
}

export async function getRelease(auth: Authed, id: string, projectKey?: string) {
  const release = await auth.db.release.findFirst({ where: { id } });
  if (!release) throw notFound();
  const projectIds = await visibleProjectIds(auth, projectKey);
  const tasks = await tasksForRelease(auth, release.id, projectIds);
  return pack(release, tasks, await todayIso(auth));
}

export async function createRelease(auth: Authed, input: { name: string; date: string }) {
  requireManageReleases(auth);
  const created = await auth.db.release.create({
    data: { tenantId: auth.tenantId, name: input.name, date: new Date(`${input.date}T00:00:00.000Z`) },
  });
  return getRelease(auth, created.id);
}

export async function updateRelease(auth: Authed, id: string, input: { name?: string; date?: string }) {
  requireManageReleases(auth);
  const existing = await auth.db.release.findFirst({ where: { id } });
  if (!existing) throw notFound();
  await auth.db.release.update({
    where: { id },
    data: {
      name: input.name,
      date: input.date ? new Date(`${input.date}T00:00:00.000Z`) : undefined,
    },
  });
  return getRelease(auth, id);
}

export async function deleteRelease(auth: Authed, id: string) {
  requireManageReleases(auth);
  const existing = await auth.db.release.findFirst({ where: { id } });
  if (!existing) throw notFound();
  await auth.db.release.delete({ where: { id } });
  return { ok: true as const };
}

export async function resolveReleaseId(auth: Authed, releaseId: string | null | undefined) {
  if (releaseId === undefined) return undefined;
  if (releaseId === null || releaseId === '') return null;
  const release = await auth.db.release.findFirst({ where: { id: releaseId } });
  if (!release) throw validation('Unknown release.');
  return release.id;
}
