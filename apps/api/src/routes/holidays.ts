import type { FastifyPluginAsync } from 'fastify';
import { addHolidaySchema, copyHolidaysSchema, isMovableHolidayName, parseYmd, putHolidaysSchema, ymdSchema } from '@borntask/shared';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { sendError, validation } from '../errors.js';
import { requireOwnerAdmin, ymdOf } from '../lib/timesheets.js';

function yearBounds(year: number) {
  return { from: parseYmd(`${year}-01-01`), to: parseYmd(`${year}-12-31`) };
}

export const holidayRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workspace/holidays', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const year = z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()).parse(
        (req.query as { year?: string }).year ?? new Date().getUTCFullYear(),
      );
      const { from, to } = yearBounds(year);
      const rows = await auth.db.workspaceHoliday.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      });
      return { year, holidays: rows.map((row) => ({ date: ymdOf(row.date), name: row.name })) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/workspace/holidays', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const row = addHolidaySchema.parse(req.body);
      const year = Number(row.date.slice(0, 4));
      const existing = await auth.db.workspaceHoliday.findUnique({
        where: { tenantId_date: { tenantId: auth.tenantId, date: parseYmd(row.date) } },
      });
      if (existing) throw validation('That date already has a holiday.');
      await auth.db.workspaceHoliday.create({
        data: { tenantId: auth.tenantId, date: parseYmd(row.date), name: row.name },
      });
      const { from, to } = yearBounds(year);
      const rows = await auth.db.workspaceHoliday.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      });
      return { year, holidays: rows.map((item) => ({ date: ymdOf(item.date), name: item.name })) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/workspace/holidays', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const date = ymdSchema.parse((req.query as { date?: string }).date);
      const year = Number(date.slice(0, 4));
      const result = await auth.db.workspaceHoliday.deleteMany({ where: { date: parseYmd(date) } });
      if (result.count === 0) throw validation('That holiday is not on the list.');
      const { from, to } = yearBounds(year);
      const rows = await auth.db.workspaceHoliday.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      });
      return { year, holidays: rows.map((item) => ({ date: ymdOf(item.date), name: item.name })) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/workspace/holidays', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const year = z.coerce.number().int().min(2000).max(2100).parse(
        (req.query as { year?: string }).year ?? new Date().getUTCFullYear(),
      );
      const body = putHolidaysSchema.parse(req.body);
      for (const row of body.holidays) {
        if (Number(row.date.slice(0, 4)) !== year) {
          throw validation('Each holiday must fall in the selected year.');
        }
      }
      const { from, to } = yearBounds(year);
      await auth.db.workspaceHoliday.deleteMany({ where: { date: { gte: from, lte: to } } });
      for (const row of body.holidays) {
        await auth.db.workspaceHoliday.create({
          data: { tenantId: auth.tenantId, date: parseYmd(row.date), name: row.name },
        });
      }
      return { year, holidays: body.holidays };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/workspace/holidays/copy', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const body = copyHolidaysSchema.parse(req.body);
      const source = yearBounds(body.from);
      const rows = await auth.db.workspaceHoliday.findMany({
        where: { date: { gte: source.from, lte: source.to } },
      });
      const skippedMovable: { date: string; name: string }[] = [];
      let copied = 0;
      for (const row of rows) {
        const monthDay = ymdOf(row.date).slice(5);
        const next = `${body.to}-${monthDay}`;
        ymdSchema.parse(next);
        if (isMovableHolidayName(row.name)) {
          skippedMovable.push({ date: ymdOf(row.date), name: row.name });
          continue;
        }
        await auth.db.workspaceHoliday.upsert({
          where: { tenantId_date: { tenantId: auth.tenantId, date: parseYmd(next) } },
          create: { tenantId: auth.tenantId, date: parseYmd(next), name: row.name },
          update: { name: row.name },
        });
        copied += 1;
      }
      return { copied, skippedMovable };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
