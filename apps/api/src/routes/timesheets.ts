import type { FastifyPluginAsync } from 'fastify';
import {
  parseYmd,
  putDaysOffSchema,
  putTimesheetsSchema,
  timesheetRangeQuerySchema,
} from '@borntask/shared';
import { requireAuth } from '../context.js';
import { forbidden, sendError, validation } from '../errors.js';
import {
  applyWeekDaysOff,
  assertDayOffAllowed,
  assertTimeAllowed,
  assertTimesheetEditable,
  canReadTimesheet,
  holidaysInRange,
  mapDayOff,
  requireTimesheetWrite,
  workspaceTimesheetSettings,
  ymdOf,
} from '../lib/timesheets.js';

export const timesheetRoutes: FastifyPluginAsync = async (app) => {
  app.get('/timesheets', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const query = timesheetRangeQuerySchema.parse(req.query);
      const userId = query.userId ?? auth.userId;
      const access = await canReadTimesheet(auth, userId);
      if (!access.ok) throw forbidden('You can only read timesheets for projects you lead.');
      const from = parseYmd(query.from);
      const to = parseYmd(query.to);
      const [entries, daysOff, holidays, settings] = await Promise.all([
        auth.db.timesheetEntry.findMany({
          where: {
            userId,
            periodStart: { gte: from, lte: to },
            ...(access.projectIds ? { projectId: { in: access.projectIds } } : {}),
          },
          orderBy: { periodStart: 'asc' },
        }),
        auth.db.timesheetDayOff.findMany({
          where: { userId, date: { gte: from, lte: to } },
          orderBy: { date: 'asc' },
        }),
        holidaysInRange(auth, from, to),
        workspaceTimesheetSettings(auth),
      ]);
      return {
        userId,
        timesheetPeriod: settings.timesheetPeriod,
        timesheetUnit: settings.timesheetUnit,
        entries: entries.map((row) => ({
          id: row.id,
          projectId: row.projectId,
          periodKind: row.periodKind,
          periodStart: ymdOf(row.periodStart),
          unit: row.unit,
          minutes: row.minutes,
          percent: row.percent,
          note: row.note,
        })),
        daysOff: daysOff.map((row) => mapDayOff(row, access.seeDayOffDetails)),
        holidays: holidays.map((row) => ({ date: ymdOf(row.date), name: row.name })),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/timesheets', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireTimesheetWrite(auth.workspaceRole);
      const body = putTimesheetsSchema.parse(req.body);
      const settings = await workspaceTimesheetSettings(auth);
      const saved = [];
      for (const entry of body.entries) {
        assertTimesheetEditable(entry.periodStart, entry.periodKind, settings.timesheetEditDays);
        await assertTimeAllowed(auth, auth.userId, entry.periodKind, entry.periodStart);
        const project = await auth.db.project.findFirst({ where: { id: entry.projectId } });
        if (!project) throw validation('That project is not in this workspace.');
        const where = {
          tenantId_userId_projectId_periodStart_periodKind: {
            tenantId: auth.tenantId,
            userId: auth.userId,
            projectId: entry.projectId,
            periodStart: parseYmd(entry.periodStart),
            periodKind: entry.periodKind,
          },
        };
        const empty =
          entry.clear ||
          ((entry.minutes ?? 0) === 0 && (entry.percent ?? 0) === 0 && !entry.note);
        if (empty) {
          await auth.db.timesheetEntry.deleteMany({
            where: {
              userId: auth.userId,
              projectId: entry.projectId,
              periodStart: parseYmd(entry.periodStart),
              periodKind: entry.periodKind,
            },
          });
          continue;
        }
        const row = await auth.db.timesheetEntry.upsert({
          where,
          create: {
            tenantId: auth.tenantId,
            userId: auth.userId,
            projectId: entry.projectId,
            periodKind: entry.periodKind,
            periodStart: parseYmd(entry.periodStart),
            unit: entry.unit,
            minutes: entry.unit === 'time' ? entry.minutes ?? 0 : null,
            percent: entry.unit === 'percent' ? entry.percent ?? 0 : null,
            note: entry.note ?? null,
          },
          update: {
            unit: entry.unit,
            minutes: entry.unit === 'time' ? entry.minutes ?? 0 : null,
            percent: entry.unit === 'percent' ? entry.percent ?? 0 : null,
            note: entry.note ?? null,
          },
        });
        saved.push(row);
      }
      return { saved: saved.length };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/timesheets/days-off', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireTimesheetWrite(auth.workspaceRole);
      const body = putDaysOffSchema.parse(req.body);
      const settings = await workspaceTimesheetSettings(auth);
      const holidayRows = await auth.db.workspaceHoliday.findMany();
      const holidaySet = new Set(holidayRows.map((row) => ymdOf(row.date)));
      if (body.week) {
        const placed = await applyWeekDaysOff(
          auth,
          auth.userId,
          body.week,
          settings.workingDays,
          settings.weekStart,
          settings.timesheetEditDays,
        );
        return { placed };
      }
      for (const day of body.days ?? []) {
        assertTimesheetEditable(day.date, 'daily', settings.timesheetEditDays);
        const date = parseYmd(day.date);
        if (day.clear) {
          await auth.db.timesheetDayOff.deleteMany({ where: { userId: auth.userId, date } });
          continue;
        }
        if (!day.kind) throw validation('Choose Leave or Other.');
        await assertDayOffAllowed(auth, auth.userId, day.date, settings.workingDays, holidaySet);
        await auth.db.timesheetDayOff.upsert({
          where: { tenantId_userId_date: { tenantId: auth.tenantId, userId: auth.userId, date } },
          create: {
            tenantId: auth.tenantId,
            userId: auth.userId,
            date,
            kind: day.kind,
            note: day.note ?? null,
          },
          update: { kind: day.kind, note: day.note ?? null },
        });
      }
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
