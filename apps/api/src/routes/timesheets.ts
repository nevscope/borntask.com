import type { FastifyPluginAsync } from 'fastify';
import {
  parseYmd,
  putDaysOffSchema,
  putTimesheetsSchema,
  memberFillsTimesheets,
  resolveMemberWorkingDays,
  timesheetExpectedStart,
  timesheetRangeQuerySchema,
} from '@borntask/shared';
import { requireAuth } from '../context.js';
import { forbidden, sendError, validation } from '../errors.js';
import {
  applyWeekDaysOff,
  assertDailyMinutesCap,
  assertDayOffAllowed,
  assertTimeAllowed,
  assertTimesheetEditable,
  canReadTimesheet,
  holidayYmidsForCountry,
  holidaysInRange,
  logTimesheetCorrection,
  memberHolidayCountry,
  mapDayOff,
  mapHoursPerWeek,
  memberWorkingDaysFor,
  requireTimesheetWrite,
  resolveTimesheetWriteUserId,
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
      const [entries, daysOff, holidays, settings, member, corrections] = await Promise.all([
        auth.db.timesheetEntry.findMany({
          where: {
            userId,
            periodStart: { gte: from, lte: to },
            project: { acceptsTimesheets: true },
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
        auth.db.tenantMember.findFirst({ where: { userId }, select: { createdAt: true, workingDays: true, hoursPerWeek: true, holidayCountry: true, timesheetsExempt: true, tenantRole: true } }),
        userId === auth.userId
          ? Promise.resolve([])
          : auth.db.activityLog.findMany({
              where: { action: 'updated timesheet', actorId: { not: userId } },
              orderBy: { at: 'desc' },
              take: 20,
              select: { id: true, actorId: true, via: true, at: true, fromJson: true },
            }),
      ]);
      const startOn = timesheetExpectedStart({
        workspaceStart: settings.timesheetsStartOn,
        joinedAt: member?.createdAt,
        memberWorkingDays: member?.workingDays,
      });
      const workingDays = resolveMemberWorkingDays(member?.workingDays, settings.workingDays);
      const holidayCountry = memberHolidayCountry(member?.holidayCountry, settings.defaultHolidayCountry);
      const personHolidays = holidays.filter((row) => row.countryCode == null || row.countryCode === holidayCountry);
      return {
        userId,
        timesheetPeriod: settings.timesheetPeriod,
        timesheetUnit: settings.timesheetUnit,
        weekStart: settings.weekStart,
        workingDays,
        hoursPerWeek: mapHoursPerWeek(member?.hoursPerWeek),
        timesheetsExempt: member?.timesheetsExempt ?? false,
        fillsTimesheets: memberFillsTimesheets({
          workspaceRole: member?.tenantRole,
          timesheetsExempt: member?.timesheetsExempt ?? false,
        }),
        holidayCountry,
        memberSince: member ? ymdOf(member.createdAt) : null,
        timesheetsStartOn: settings.timesheetsStartOn ? ymdOf(settings.timesheetsStartOn) : null,
        expectedFrom: startOn ? ymdOf(startOn) : null,
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
        holidays: personHolidays.map((row) => ({ date: ymdOf(row.date), name: row.name, countryCode: row.countryCode })),
        corrections: corrections
          .filter((row) => {
            const fromJson = row.fromJson as { sheetUserId?: string } | null;
            return fromJson?.sheetUserId === userId;
          })
          .slice(0, 5)
          .map((row) => ({
            id: row.id,
            actorId: row.actorId ?? '',
            via: row.via,
            at: row.at.toISOString(),
          })),
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
      const userId = await resolveTimesheetWriteUserId(auth, body.userId);
      if (userId === auth.userId) {
        const self = await auth.db.tenantMember.findFirst({ where: { userId }, select: { timesheetsExempt: true, tenantRole: true } });
        if (!memberFillsTimesheets({ workspaceRole: self?.tenantRole ?? auth.workspaceRole, timesheetsExempt: self?.timesheetsExempt })) {
          throw validation('You do not fill timesheets.');
        }
      }
      const settings = await workspaceTimesheetSettings(auth);
      const saved = [];
      for (const entry of body.entries) {
        assertTimesheetEditable(entry.periodStart, entry.periodKind, settings.timesheetEditDays);
        await assertTimeAllowed(auth, userId, entry.periodKind, entry.periodStart);
        const project = await auth.db.project.findFirst({ where: { id: entry.projectId } });
        if (!project) throw validation('That project is not in this workspace.');
        if (!project.acceptsTimesheets) throw validation('This project does not accept timesheets.');
        const minutes = entry.unit === 'time' ? entry.minutes ?? 0 : 0;
        if (entry.periodKind === 'daily' && entry.unit === 'time' && !entry.clear) {
          await assertDailyMinutesCap(auth, userId, entry.periodStart, entry.projectId, minutes);
        }
        const where = {
          tenantId_userId_projectId_periodStart_periodKind: {
            tenantId: auth.tenantId,
            userId,
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
              userId,
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
            userId,
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
      await logTimesheetCorrection(auth, userId, { kind: 'entries', saved: saved.length });
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
      const userId = await resolveTimesheetWriteUserId(auth, body.userId);
      if (userId === auth.userId) {
        const self = await auth.db.tenantMember.findFirst({ where: { userId }, select: { timesheetsExempt: true, tenantRole: true } });
        if (!memberFillsTimesheets({ workspaceRole: self?.tenantRole ?? auth.workspaceRole, timesheetsExempt: self?.timesheetsExempt })) {
          throw validation('You do not fill timesheets.');
        }
      }
      const settings = await workspaceTimesheetSettings(auth);
      const holidayRows = await auth.db.workspaceHoliday.findMany();
      const member = await auth.db.tenantMember.findFirst({
        where: { userId },
        select: { holidayCountry: true },
      });
      const holidaySet = new Set(
        holidayYmidsForCountry(holidayRows, memberHolidayCountry(member?.holidayCountry, settings.defaultHolidayCountry)),
      );
      const workingDays = await memberWorkingDaysFor(auth, userId, settings.workingDays);
      if (body.week) {
        const placed = await applyWeekDaysOff(
          auth,
          userId,
          body.week,
          workingDays,
          settings.weekStart,
          settings.timesheetEditDays,
        );
        await logTimesheetCorrection(auth, userId, { kind: 'daysOff', week: body.week.weekStart, count: placed.length });
        return { placed };
      }
      for (const day of body.days ?? []) {
        assertTimesheetEditable(day.date, 'daily', settings.timesheetEditDays);
        const date = parseYmd(day.date);
        if (day.clear) {
          await auth.db.timesheetDayOff.deleteMany({ where: { userId, date } });
          continue;
        }
        if (!day.kind) throw validation('Choose Leave or Other.');
        await assertDayOffAllowed(auth, userId, day.date, workingDays, holidaySet);
        await auth.db.timesheetDayOff.upsert({
          where: { tenantId_userId_date: { tenantId: auth.tenantId, userId, date } },
          create: {
            tenantId: auth.tenantId,
            userId,
            date,
            kind: day.kind,
            note: day.note ?? null,
          },
          update: { kind: day.kind, note: day.note ?? null },
        });
      }
      await logTimesheetCorrection(auth, userId, { kind: 'daysOff', days: (body.days ?? []).map((d) => d.date) });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
