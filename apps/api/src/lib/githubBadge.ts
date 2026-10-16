import { githubBadgeFromLinks, type GithubBadge } from '@borntask/shared';
import type { TenantClient } from '../tenantPrisma.js';

export async function badgesForTasks(db: TenantClient, taskIds: string[]): Promise<Map<string, GithubBadge>> {
  const map = new Map<string, GithubBadge>();
  if (!taskIds.length) return map;
  const links = await db.devLink.findMany({ where: { taskId: { in: taskIds } } });
  const byTask = new Map<string, typeof links>();
  for (const link of links) {
    const list = byTask.get(link.taskId) ?? [];
    list.push(link);
    byTask.set(link.taskId, list);
  }
  for (const [taskId, rows] of byTask) {
    const badge = githubBadgeFromLinks(rows);
    if (badge) map.set(taskId, badge);
  }
  return map;
}

export function withGithubBadge<T extends { id: string }>(
  row: T,
  badges: Map<string, GithubBadge>,
): T & { githubBadge: GithubBadge | null } {
  return { ...row, githubBadge: badges.get(row.id) ?? null };
}
