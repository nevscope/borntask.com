import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../env.js';
import { notFound, validation } from '../errors.js';
import type { Authed } from '../context.js';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function assertKey(tenantId: string, storageKey: string) {
  if (!storageKey.startsWith(`${tenantId}/`) || storageKey.includes('..')) throw notFound();
}

export function mapAttachment(
  taskKey: string,
  row: { id: string; name: string; size: number; mime: string },
) {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mime: row.mime,
    url: `/tasks/${encodeURIComponent(taskKey)}/attachments/${encodeURIComponent(row.id)}`,
  };
}

export async function storePendingUpload(
  tenantId: string,
  file: { filename: string; mimetype: string; buffer: Buffer },
): Promise<{ id: string; name: string; size: number; mime: string }> {
  if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw validation('Files must be 25 MB or smaller.');
  const id = randomUUID();
  const dir = join(config.blobRoot, tenantId, 'pending');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, id), file.buffer);
  await writeFile(
    join(dir, `${id}.json`),
    JSON.stringify({ name: file.filename || 'Attachment', mime: file.mimetype || 'application/octet-stream', size: file.buffer.length }),
  );
  return { id, name: file.filename || 'Attachment', size: file.buffer.length, mime: file.mimetype || 'application/octet-stream' };
}

export async function attachPendingToTask(auth: Authed, taskId: string, ids: string[]) {
  if (!ids.length) return;
  const unique = [...new Set(ids)];
  for (const id of unique) {
    const pending = join(config.blobRoot, auth.tenantId, 'pending', id);
    const metaRaw = await readFile(`${pending}.json`, 'utf8').catch(() => null);
    if (!metaRaw) continue;
    const meta = JSON.parse(metaRaw) as { name: string; mime: string; size: number };
    const destKey = `${auth.tenantId}/${taskId}/${id}-${safeSegment(meta.name)}`;
    const dest = join(config.blobRoot, destKey);
    await mkdir(join(config.blobRoot, auth.tenantId, taskId), { recursive: true });
    await rename(pending, dest).catch(async () => {
      const buf = await readFile(pending);
      await writeFile(dest, buf);
      await rm(pending, { force: true });
    });
    await rm(`${pending}.json`, { force: true });
    await auth.db.attachment.create({
      data: {
        tenantId: auth.tenantId,
        taskId,
        storageKey: destKey,
        name: meta.name,
        size: meta.size,
        mime: meta.mime,
      },
    });
  }
}

export async function storeTaskUpload(
  auth: Authed,
  taskId: string,
  file: { filename: string; mimetype: string; buffer: Buffer },
) {
  if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw validation('Files must be 25 MB or smaller.');
  const id = randomUUID();
  const destKey = `${auth.tenantId}/${taskId}/${id}-${safeSegment(file.filename || 'file')}`;
  await mkdir(join(config.blobRoot, auth.tenantId, taskId), { recursive: true });
  await writeFile(join(config.blobRoot, destKey), file.buffer);
  return auth.db.attachment.create({
    data: {
      tenantId: auth.tenantId,
      taskId,
      storageKey: destKey,
      name: file.filename || 'Attachment',
      size: file.buffer.length,
      mime: file.mimetype || 'application/octet-stream',
    },
  });
}

export async function openAttachmentFile(tenantId: string, storageKey: string) {
  assertKey(tenantId, storageKey);
  return createReadStream(join(config.blobRoot, storageKey));
}

export async function removeAttachmentFile(tenantId: string, storageKey: string) {
  assertKey(tenantId, storageKey);
  await rm(join(config.blobRoot, storageKey), { force: true });
}
