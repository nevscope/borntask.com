import type { FastifyPluginAsync } from 'fastify';
import { addHolidaySchema, copyHolidaysSchema, countryCodeOrNullSchema, importHolidaysSchema, isMovableHolidayName, parseYmd, putHolidaysSchema, ymdSchema } from '@borntask/shared';
import { z } from 'zod';
import { requireAuth, type Authed } from '../context.js';
import { ApiError, sendError, validation } from '../errors.js';
import { listHolidayCountries, listPublicHolidays } from '../lib/publicHolidays.js';
import { requireOwnerAdmin, ymdOf } from '../lib/timesheets.js';

function yearBounds(year: number) {
  return { from: parseYmd(`${year}-01-01`), to: parseYmd(`${year}-12-31`) };
}

function mapHoliday(row: { date: Date; name: string; countryCode: string | null }) {
  return { date: ymdOf(row.date), name: row.name, countryCode: row.countryCode };
}

async function listYear(auth: Authed, year: number) {
  const { from, to } = yearBounds(year);
  const rows = await auth.db.workspaceHoliday.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ date: 'asc' }, { countryCode: 'asc' }],
  });
  return { year, holidays: rows.map(mapHoliday) };
}

export const holidayRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workspace/holidays', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const year = z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()).parse(
        (req.query as { year?: string }).year ?? new Date().getUTCFullYear(),
      );
      return await listYear(auth, year);
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
      const existing = await auth.db.workspaceHoliday.findFirst({
        where: { date: parseYmd(row.date), countryCode: row.countryCode ?? null },
      });
      if (existing) throw validation('That date already has a holiday for this country.');
      await auth.db.workspaceHoliday.create({
        data: {
          tenantId: auth.tenantId,
          date: parseYmd(row.date),
          name: row.name,
          countryCode: row.countryCode ?? null,
        },
      });
      return await listYear(auth, year);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/workspace/holidays', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const date = ymdSchema.parse((req.query as { date?: string }).date);
      const countryCode = countryCodeOrNullSchema.optional().parse((req.query as { countryCode?: string }).countryCode) ?? null;
      const year = Number(date.slice(0, 4));
      const result = await auth.db.workspaceHoliday.deleteMany({
        where: { date: parseYmd(date), countryCode },
      });
      if (result.count === 0) throw validation('That holiday is not on the list.');
      return await listYear(auth, year);
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
          data: {
            tenantId: auth.tenantId,
            date: parseYmd(row.date),
            name: row.name,
            countryCode: row.countryCode ?? null,
          },
        });
      }
      return { year, holidays: body.holidays.map((row) => ({ ...row, countryCode: row.countryCode ?? null })) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/workspace/holidays/countries', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      return { countries: await listHolidayCountries() };
    } catch (err) {
      if (err instanceof ApiError) return sendError(reply, err);
      return sendError(reply, validation('Could not load the country list. Try again in a minute.'));
    }
  });

  app.post('/workspace/holidays/import', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const body = importHolidaysSchema.parse(req.body);
      const incoming = await listPublicHolidays(body.year, body.countryCode);
      if (incoming.length === 0) throw validation('That country has no public holidays for this year.');
      let added = 0;
      let updated = 0;
      for (const row of incoming) {
        const existing = await auth.db.workspaceHoliday.findFirst({
          where: { date: parseYmd(row.date), countryCode: body.countryCode },
        });
        if (existing) {
          await auth.db.workspaceHoliday.update({
            where: { id: existing.id },
            data: { name: row.name },
          });
          updated += 1;
        } else {
          await auth.db.workspaceHoliday.create({
            data: {
              tenantId: auth.tenantId,
              date: parseYmd(row.date),
              name: row.name,
              countryCode: body.countryCode,
            },
          });
          added += 1;
        }
      }
      const listed = await listYear(auth, body.year);
      return { ...listed, added, updated };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('holidays_api_')) {
        return sendError(reply, validation('Could not load public holidays just now. Try again in a minute.'));
      }
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
      const skippedMovable: { date: string; name: string; countryCode: string | null }[] = [];
      let copied = 0;
      for (const row of rows) {
        const monthDay = ymdOf(row.date).slice(5);
        const next = `${body.to}-${monthDay}`;
        ymdSchema.parse(next);
        if (isMovableHolidayName(row.name)) {
          skippedMovable.push({ date: ymdOf(row.date), name: row.name, countryCode: row.countryCode });
          continue;
        }
        const existing = await auth.db.workspaceHoliday.findFirst({
          where: { date: parseYmd(next), countryCode: row.countryCode },
        });
        if (existing) {
          await auth.db.workspaceHoliday.update({
            where: { id: existing.id },
            data: { name: row.name, countryCode: row.countryCode },
          });
        } else {
          await auth.db.workspaceHoliday.create({
            data: {
              tenantId: auth.tenantId,
              date: parseYmd(next),
              name: row.name,
              countryCode: row.countryCode,
            },
          });
        }
        copied += 1;
      }
      return { copied, skippedMovable };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
