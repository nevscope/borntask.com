import { z } from 'zod';
import { ymdSchema } from './timesheets.js';

export const createReleaseSchema = z.object({
  name: z.string().trim().min(1, 'Give the release a name.').max(80),
  date: ymdSchema,
});

export const patchReleaseSchema = createReleaseSchema.partial();

export const releasesQuerySchema = z.object({
  projectKey: z.string().trim().min(1).max(12).optional(),
});

export type ReleaseStatusCategory = 'backlog' | 'active' | 'review' | 'done';

export type ReleaseTaskSlice = {
  statusId: string;
  statusName: string;
  statusCategory: ReleaseStatusCategory;
};

const CATEGORY_ORDER: ReleaseStatusCategory[] = ['backlog', 'active', 'review', 'done'];

export function summariseReleaseProgress(tasks: ReleaseTaskSlice[]) {
  const map = new Map<string, { id: string; name: string; category: ReleaseStatusCategory; count: number }>();
  for (const task of tasks) {
    const current = map.get(task.statusId);
    if (current) current.count += 1;
    else {
      map.set(task.statusId, {
        id: task.statusId,
        name: task.statusName,
        category: task.statusCategory,
        count: 1,
      });
    }
  }
  const byStatus = [...map.values()].sort((a, b) => {
    const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (byCategory) return byCategory;
    return a.name.localeCompare(b.name, 'en-GB');
  });
  const done = tasks.filter((task) => task.statusCategory === 'done').length;
  return { total: tasks.length, done, byStatus };
}

export function isReleaseReleased(dateIso: string, todayIso: string) {
  return dateIso <= todayIso;
}

export function formatReleaseDate(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
