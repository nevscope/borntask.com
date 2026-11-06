import type { Authed } from '../context.js';

export async function ensureWatching(auth: Authed, taskId: string, userIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(ids.map((userId) => auth.db.taskWatcher.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { tenantId: auth.tenantId, taskId, userId },
    update: {},
  })));
}
