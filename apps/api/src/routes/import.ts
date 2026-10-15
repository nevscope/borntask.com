import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultMapping, parseDelimited, type ParsedSheet } from '@borntask/shared';
import { parseXlsx, sheetToCsv } from '../lib/xlsxSheet.js';
import { requireAuth } from '../context.js';
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
      if (!file) throw validation('Choose a .csv or .xlsx export.');
      const qKey = String((req.query as { projectKey?: string }).projectKey ?? '');
      const field = file.fields.projectKey;
      const fieldKey = field && !Array.isArray(field) && 'value' in field ? String(field.value) : '';
      const projectKey = qKey || fieldKey;
      const project = await auth.db.project.findFirst({ where: { key: projectKey } });
      if (!project) throw notFound('Choose a project to import into.');
      const buf = await file.toBuffer();
      const name = file.filename || 'asana-export.csv';
      const isXlsx = name.toLowerCase().endsWith('.xlsx') || (buf[0] === 0x50 && buf[1] === 0x4b);
      let text: string;
      let parsed: ParsedSheet;
      if (isXlsx) {
        try {
          parsed = parseXlsx(buf);
        } catch (err) {
          throw validation(err instanceof Error ? err.message : 'Could not read that workbook.');
        }
        text = sheetToCsv(parsed);
      } else {
        text = buf.toString('utf8');
        parsed = parseDelimited(text);
      }
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
      return serializeImport(job.id, name, parsed, defaultMapping(parsed.headers), project.key, parsed.rows.length);
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
      return {
        ...serializeImport(job.id, job.fileName, parsed, mapping, project?.key ?? '', job.rowsTotal),
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

function serializeImport(
  id: string,
  fileName: string,
  parsed: { headers: string[]; rows: Record<string, string>[] },
  mapping: Record<string, string>,
  projectKey: string,
  rowsTotal: number,
) {
  const preview = parsed.rows.slice(0, 20);
  const emails = new Set<string>();
  const emailCol = Object.entries(mapping).find(([, f]) => f === 'assigneeEmail')?.[0];
  if (emailCol) {
    for (const row of parsed.rows) {
      const e = (row[emailCol] ?? '').trim().toLowerCase();
      if (e.includes('@')) emails.add(e);
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
  };
}
