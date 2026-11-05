/**
 * One-off / admin-run: copy app.asana.com get_asset files onto BornTask tasks,
 * rewrite those links, and drop labels that only repeat the task type.
 *
 * Dry-run by default. Pass --apply to write. Token from ASANA_PAT only (never commit it).
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { attachmentRejectReason } from '@borntask/shared';
import {
  attachmentNameForAsset,
  existingAttachmentForAsset,
  labelsRepeatingType,
  rewriteAsanaAssetLinks,
  taskAttachmentHref,
  uniqueAsanaAssetIds,
} from '../packages/shared/src/asanaAssetCopy.ts';

const prisma = new PrismaClient();

type TaskLog = {
  key: string;
  ok: boolean;
  assets: { assetId: string; action: string; name?: string }[];
  labelsRemoved: string[];
  error: string | null;
};

type Cli = {
  workspace: string;
  project?: string;
  task?: string;
  apply: boolean;
  log: string;
  delayMs: number;
  limit?: number;
};

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  return argv[i + 1];
}

function parseCli(argv: string[]): Cli {
  const workspace = argValue(argv, '--workspace');
  if (!workspace) {
    throw new Error('Pass --workspace <slug> (and optionally --project GEN).');
  }
  const delayRaw = argValue(argv, '--delay-ms');
  const limitRaw = argValue(argv, '--limit');
  return {
    workspace,
    project: argValue(argv, '--project'),
    task: argValue(argv, '--task'),
    apply: argv.includes('--apply'),
    log: argValue(argv, '--log') ?? `.data/asana-asset-copy-${stamp()}.json`,
    delayMs: delayRaw ? Math.max(100, Number(delayRaw)) : 400,
    limit: limitRaw ? Math.max(1, Number(limitRaw)) : undefined,
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function taskKey(projectKey: string, number: number) {
  return `${projectKey}-${number}`;
}

function parseTaskKey(key: string): { projectKey: string; number: number } | null {
  const i = key.lastIndexOf('-');
  if (i <= 0) return null;
  const number = Number(key.slice(i + 1));
  if (!Number.isInteger(number) || number < 1) return null;
  return { projectKey: key.slice(0, i), number };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

let lastAsanaAt = 0;

async function pace(delayMs: number) {
  const wait = delayMs - (Date.now() - lastAsanaAt);
  if (wait > 0) await sleep(wait);
  lastAsanaAt = Date.now();
}

async function asanaFetch(token: string, url: string, delayMs: number, accept: string): Promise<Response> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await pace(delayMs);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: accept },
      redirect: 'follow',
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') ?? '15');
      await sleep(Math.min(60, Number.isFinite(wait) ? wait : 15) * 1000);
      continue;
    }
    return res;
  }
  throw new Error('Asana rate-limited this run. Wait a few minutes and retry.');
}

async function downloadAsanaAsset(
  token: string,
  assetId: string,
  delayMs: number,
): Promise<{ name: string; mime: string; buffer: Buffer }> {
  const metaUrl = `https://app.asana.com/api/1.0/attachments/${assetId}?opt_fields=name,download_url,host`;
  const metaRes = await asanaFetch(token, metaUrl, delayMs, 'application/json');
  let name = `asana-${assetId}.bin`;
  let mime = 'application/octet-stream';
  let fileUrl = `https://app.asana.com/api/1.0/attachments/${assetId}/content`;
  if (metaRes.ok) {
    const body = await metaRes.json() as {
      data?: { name?: string; download_url?: string };
    };
    if (body.data?.name) name = body.data.name;
    if (body.data?.download_url) fileUrl = body.data.download_url;
  } else if (metaRes.status !== 404) {
    throw new Error(`Asana attachment ${assetId} returned ${metaRes.status}`);
  } else {
    fileUrl = `https://app.asana.com/app/asana/-/get_asset?asset_id=${assetId}`;
  }
  const fileRes = await asanaFetch(token, fileUrl, delayMs, '*/*');
  if (!fileRes.ok) throw new Error(`Asana download ${assetId} returned ${fileRes.status}`);
  mime = fileRes.headers.get('content-type')?.split(';')[0]?.trim() || mime;
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const reject = attachmentRejectReason(name, buffer.length, mime);
  if (reject) throw new Error(reject);
  return { name, mime, buffer };
}

async function writeLog(path: string, payload: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const cli = parseCli(process.argv.slice(2));
  const token = (process.env.ASANA_PAT ?? '').trim();
  if (cli.apply && !token) throw new Error('Set ASANA_PAT in the environment. Do not put it in git.');

  const workspace = await prisma.workspace.findFirst({ where: { slug: cli.workspace } });
  if (!workspace) throw new Error(`Workspace slug not found: ${cli.workspace}`);

  const project = cli.project
    ? await prisma.project.findFirst({ where: { tenantId: workspace.id, key: cli.project } })
    : null;
  if (cli.project && !project) throw new Error(`Project ${cli.project} not found in ${cli.workspace}`);

  const taskRef = cli.task ? parseTaskKey(cli.task) : null;
  if (cli.task && !taskRef) throw new Error(`Task key looks wrong: ${cli.task}`);

  const tasks = await prisma.task.findMany({
    where: {
      tenantId: workspace.id,
      deletedAt: null,
      ...(project ? { projectId: project.id } : {}),
      ...(taskRef ? { project: { key: taskRef.projectKey }, number: taskRef.number } : {}),
    },
    include: {
      project: { select: { key: true } },
      type: { select: { name: true } },
      labels: { include: { label: true } },
      comments: { where: { deletedAt: null }, select: { id: true, body: true } },
      attachments: { select: { id: true, name: true } },
    },
    orderBy: [{ projectId: 'asc' }, { number: 'asc' }],
    take: cli.limit,
  });

  const report = {
    dryRun: !cli.apply,
    workspace: cli.workspace,
    project: cli.project ?? null,
    startedAt: new Date().toISOString(),
    log: cli.log,
    tasks: [] as TaskLog[],
    errors: [] as { key: string; error: string }[],
  };

  console.log(`${cli.apply ? 'APPLY' : 'DRY-RUN'} ${tasks.length} task(s). Log: ${cli.log}`);

  for (const row of tasks) {
    const key = taskKey(row.project.key, row.number);
    const entry: TaskLog = { key, ok: true, assets: [], labelsRemoved: [], error: null };
    try {
      const texts = [row.description ?? '', ...row.comments.map((c) => c.body)];
      const assetIds = [...new Set(texts.flatMap((text) => uniqueAsanaAssetIds(text)))];
      const replacements = new Map<string, string>();
      const attachments = [...row.attachments];

      for (const assetId of assetIds) {
        const already = existingAttachmentForAsset(attachments, assetId);
        if (already) {
          replacements.set(assetId, taskAttachmentHref(key, already.id));
          entry.assets.push({ assetId, action: 'reuse', name: already.name });
          continue;
        }
        if (!cli.apply) {
          entry.assets.push({ assetId, action: token ? 'would-download' : 'would-download (needs ASANA_PAT)' });
          replacements.set(assetId, taskAttachmentHref(key, `pending-${assetId}`));
          continue;
        }
        const file = await downloadAsanaAsset(token, assetId, cli.delayMs);
        const name = attachmentNameForAsset(assetId, file.name);
        const reject = attachmentRejectReason(name, file.buffer.length, file.mime);
        if (reject) throw new Error(`${name}: ${reject}`);
        const destKey = `${row.tenantId}/${row.id}/${randomUUID()}-${safeSegment(name)}`;
        const dest = join(process.env.BLOB_ROOT ?? '.data/blobs', destKey);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, file.buffer);
        const created = await prisma.attachment.create({
          data: {
            tenantId: row.tenantId,
            taskId: row.id,
            storageKey: destKey,
            name,
            size: file.buffer.length,
            mime: file.mime,
          },
        });
        attachments.push({ id: created.id, name });
        replacements.set(assetId, taskAttachmentHref(key, created.id));
        entry.assets.push({ assetId, action: 'attached', name });
      }

      const nextDescription = rewriteAsanaAssetLinks(row.description ?? '', replacements);
      const commentUpdates = row.comments
        .map((comment) => ({
          id: comment.id,
          body: rewriteAsanaAssetLinks(comment.body, replacements),
        }))
        .filter((comment, i) => comment.body !== row.comments[i]!.body);

      const dupes = labelsRepeatingType(
        row.type.name,
        row.labels.map((link) => ({ id: link.id, name: link.label.name })),
      );
      entry.labelsRemoved = dupes.map((item) => item.name);

      if (cli.apply) {
        if (nextDescription !== (row.description ?? '')) {
          await prisma.task.update({ where: { id: row.id }, data: { description: nextDescription } });
        }
        for (const comment of commentUpdates) {
          await prisma.comment.update({ where: { id: comment.id }, data: { body: comment.body } });
        }
        if (dupes.length) {
          await prisma.taskLabel.deleteMany({ where: { id: { in: dupes.map((item) => item.id) } } });
        }
      }
    } catch (err) {
      entry.ok = false;
      entry.error = err instanceof Error ? err.message : 'Unknown error';
      report.errors.push({ key, error: entry.error });
      console.error(`${key}: ${entry.error}`);
    }
    report.tasks.push(entry);
    await writeLog(cli.log, report);
  }

  report.tasks.sort((a, b) => a.key.localeCompare(b.key));
  await writeLog(cli.log, { ...report, finishedAt: new Date().toISOString() });
  console.log(`Done. ${report.errors.length} task error(s). ${report.tasks.filter((t) => t.assets.length || t.labelsRemoved.length).length} task(s) with work.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
