import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

export const TRASH_MS = 30 * 24 * 60 * 60 * 1000;

const prisma = new PrismaClient();
const blobRoot = process.env.BLOB_ROOT ?? '.data/blobs';

export function isDueForHardDelete(deletedAt: Date | null | undefined, now: Date): boolean {
  if (!deletedAt) return false;
  return now.getTime() - deletedAt.getTime() >= TRASH_MS;
}

async function removeBlob(storageKey: string) {
  if (!storageKey || storageKey.includes('..')) return;
  await rm(join(blobRoot, storageKey), { force: true }).catch(() => undefined);
}

/** Hard-delete tasks that have been in Trash longer than 30 days. Restore is unchanged. */
export async function runTrashPurge(opts?: { now?: Date; dryRun?: boolean }): Promise<{
  ok: true;
  dryRun: boolean;
  taskIds: string[];
  files: number;
}> {
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - TRASH_MS);
  const expired = await prisma.task.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, tenantId: true, attachments: { select: { storageKey: true } } },
  });
  const taskIds = expired.map((row) => row.id);
  const files = expired.flatMap((row) => row.attachments.map((att) => att.storageKey));
  if (opts?.dryRun) {
    return { ok: true, dryRun: true, taskIds, files: files.length };
  }
  if (!taskIds.length) return { ok: true, dryRun: false, taskIds: [], files: 0 };

  for (const key of files) await removeBlob(key);

  await prisma.$transaction(async (tx) => {
    await tx.activityLog.updateMany({ where: { taskId: { in: taskIds } }, data: { taskId: null } });
    await tx.notification.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.task.updateMany({ where: { parentId: { in: taskIds }, id: { notIn: taskIds } }, data: { parentId: null } });
    await tx.task.deleteMany({ where: { id: { in: taskIds } } });
  });

  return { ok: true, dryRun: false, taskIds, files: files.length };
}
