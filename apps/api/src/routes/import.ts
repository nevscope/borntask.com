import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultMapping, parseDelimited } from '@borntask/shared';
import { prisma } from '../db.js';
import { requireAuth, type Authed } from '../context.js';
import { config } from '../env.js';
import { forbidden, notFound, sendError, validation } from '../errors.js';
import { getImportQueue, JOB } from '../lib/queue.js';

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post('/imports', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.workspaceRole === 'guest' || auth.workspaceRole === 'viewer') {
        throw forbidden('Guests and viewers cannot import.');
      }
      const file = await req.file();
      if (!file) throw validation('Choose a CSV export.');
      const qKey = String((req.query as { projectKey?: string }).projectKey ?? '');
      const field = file.fields.projectKey;
      const fieldKey = field && !Array.isArray(field) && 'value' in field ? String(field.value) : '';
      const projectKey = qKey || fieldKey;
      const project = await auth.db.project.findFirst({ where: { key: projectKey } });
      if (!project) throw notFound('Choose a project to import into.');
      const buf = await file.toBuffer();
      const name = file.filename || 'asana-export.csv';
      const isXlsx = name.toLowerCase().endsWith('.xlsx') || (buf[0] === 0x50 && buf[1] === 0x4b);
      if (isXlsx) {
        throw validation('Save the Asana export as CSV for now. XLSX parsing is not bundled yet.');
      }
      const text = buf.toString('utf8');
      const parsed = parseDelimited(text);
      if (parsed.headers.length === 0) throw validation('That file has no header row.');
      const job = await auth.db.importJob.create({
        data: {
          tenantId: auth.tenantId,
          projectId: project.id,
          fileName: name,
          storageKey: '',
          status: 'mapping',
          mapping: defaultMapping(parsed.headers),
          rowsTotal: parsed.rows.length,
          createdById: auth.userId,
        },
      });
      const dir = join(config.blobRoot, 'imports', auth.tenantId);
      await mkdir(dir, { recursive: true });
      const storageKey = join('imports', auth.tenantId, `${job.id}.csv`);
      await writeFile(join(config.blobRoot, storageKey), text, 'utf8');
      await auth.db.importJob.update({ where: { id: job.id }, data: { storageKey } });
      const known = await memberEmails(auth);
      return serializeImport(job.id, name, parsed, defaultMapping(parsed.headers), project.key, parsed.rows.length, known);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/imports/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const job = await auth.db.importJob.findFirst({ where: { id } });
      if (!job) throw notFound();
      const project = await auth.db.project.findFirst({ where: { id: job.projectId } });
      const { readFile } = await import('node:fs/promises');
      const text = await readFile(join(config.blobRoot, job.storageKey), 'utf8');
      const parsed = parseDelimited(text);
      const mapping = flattenMapping(job.mapping, parsed.headers);
      const known = await memberEmails(auth);
      return {
        ...serializeImport(job.id, job.fileName, parsed, mapping, project?.key ?? '', job.rowsTotal, known),
        status: job.status,
        rowsDone: job.rowsDone,
        errors: job.errors,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/imports/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const body = z.object({
        mapping: z.record(z.string()),
        sectionsAs: z.enum(['sections', 'statuses']).optional(),
      }).parse(req.body);
      const job = await auth.db.importJob.findFirst({ where: { id } });
      if (!job) throw notFound();
      await auth.db.importJob.update({
        where: { id: job.id },
        data: { mapping: { columns: body.mapping, sectionsAs: body.sectionsAs ?? 'sections' } },
      });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/imports/:id/run', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const job = await auth.db.importJob.findFirst({ where: { id } });
      if (!job) throw notFound();
      await auth.db.importJob.update({ where: { id: job.id }, data: { status: 'running', rowsDone: 0 } });
      await getImportQueue().add(JOB.asanaImport, {
        tenantId: auth.tenantId,
        importJobId: job.id,
        actorId: auth.userId,
      });
      return { ok: true, status: 'running' };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};

function flattenMapping(raw: unknown, headers: string[]): Record<string, string> {
  if (raw && typeof raw === 'object' && 'columns' in raw) {
    const cols = (raw as { columns?: unknown }).columns;
    if (cols && typeof cols === 'object') return cols as Record<string, string>;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>;
  return defaultMapping(headers);
}

async function memberEmails(auth: Authed): Promise<Set<string>> {
  const members = await auth.db.tenantMember.findMany({ where: { isActive: true }, select: { userId: true } });
  if (members.length === 0) return new Set();
  const users = await prisma.user.findMany({
    where: { id: { in: members.map((m) => m.userId) } },
    select: { email: true },
  });
  return new Set(users.map((u) => u.email.toLowerCase()));
}

function serializeImport(
  id: string,
  fileName: string,
  parsed: { headers: string[]; rows: Record<string, string>[] },
  mapping: Record<string, string>,
  projectKey: string,
  rowsTotal: number,
  knownEmails: Set<string>,
) {
  const preview = parsed.rows.slice(0, 20);
  const emails = new Set<string>();
  let matchedEmailCount = 0;
  const emailCol = Object.entries(mapping).find(([, f]) => f === 'assigneeEmail')?.[0];
  if (emailCol) {
    const seen = new Set<string>();
    for (const row of parsed.rows) {
      const e = (row[emailCol] ?? '').trim().toLowerCase();
      if (!e.includes('@') || seen.has(e)) continue;
      seen.add(e);
      if (knownEmails.has(e)) matchedEmailCount += 1;
      else emails.add(e);
    }
  }
  return {
    id,
    fileName,
    projectKey,
    rowsTotal,
    headers: parsed.headers,
    mapping,
    preview,
    unknownEmails: [...emails],
    matchedEmailCount,
    sectionValues: columnCounts(parsed.rows, colFor(mapping, 'section')),
    statusValues: columnCounts(parsed.rows, colFor(mapping, 'status')),
  };
}

function colFor(mapping: Record<string, string>, field: string): string | undefined {
  return Object.entries(mapping).find(([, f]) => f === field)?.[0];
}

function columnCounts(rows: Record<string, string>[], col: string | undefined): { name: string; n: number }[] {
  if (!col) return [];
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = (row[col] ?? '').trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
}
