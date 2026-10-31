import {
  expectedDays,
  formatYmd,
  isWorkingDay,
  parseWorkingDays,
  parseYmd,
  placeWeeklyDaysOff,
  weekStartFor,
} from '@borntask/shared';
import type { Authed } from '../context.js';
import { conflict, forbidden, notFound, validation } from '../errors.js';

export function requireTimesheetWrite(role: Authed['workspaceRole']) {
  if (role === 'guest' || role === 'viewer') throw forbidden('Guests and viewers cannot log time.');
}

export function requireOwnerAdmin(role: Authed['workspaceRole']) {
  if (role !== 'owner' && role !== 'admin') throw forbidden('Owners and admins only.');
}

export function isOwnerAdmin(role: Authed['workspaceRole']) {
  return role === 'owner' || role === 'admin';
}

export function ymdOf(value: Date): string {
  return formatYmd(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())));
}

export async function workspaceTimesheetSettings(auth: Authed) {
  const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
  if (!ws) throw notFound();
  return {
    timesheetPeriod: ws.timesheetPeriod,
    timesheetUnit: ws.timesheetUnit,
    workingDays: parseWorkingDays(ws.workingDays),
    weekStart: ws.weekStart,
    timeZone: ws.timeZone,
  };
}

export async function ledProjectIds(auth: Authed): Promise<string[]> {
  const rows = await auth.db.project.findMany({ where: { leadId: auth.userId }, select: { id: true } });
  return rows.map((row) => row.id);
}

export async function canReadTimesheet(auth: Authed, userId: string): Promise<{
  ok: boolean;
  projectIds: string[] | null;
  seeDayOffDetails: boolean;
}> {
  if (userId === auth.userId) {
    return { ok: true, projectIds: null, seeDayOffDetails: true };
  }
  if (isOwnerAdmin(auth.workspaceRole)) {
    return { ok: true, projectIds: null, seeDayOffDetails: true };
  }
  const led = await ledProjectIds(auth);
  if (led.length === 0) return { ok: false, projectIds: [], seeDayOffDetails: false };
  return { ok: true, projectIds: led, seeDayOffDetails: false };
}

export async function holidaysInRange(auth: Authed, from: Date, to: Date) {
  return auth.db.workspaceHoliday.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  });
}

export async function dailyTimeDates(auth: Authed, userId: string, dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const starts = dates.map(parseYmd);
  const rows = await auth.db.timesheetEntry.findMany({
    where: {
      userId,
      periodKind: 'daily',
      periodStart: { in: starts },
      OR: [{ minutes: { gt: 0 } }, { percent: { gt: 0 } }],
    },
    select: { periodStart: true },
  });
  return new Set(rows.map((row) => ymdOf(row.periodStart)));
}

export async function assertDayOffAllowed(
  auth: Authed,
  userId: string,
  dateYmd: string,
  workingDays: string[],
  holidaySet: Set<string>,
) {
  const date = parseYmd(dateYmd);
  if (!isWorkingDay(date, workingDays) || holidaySet.has(dateYmd)) {
    throw conflict('That date is not a working day.');
  }
  const timed = await dailyTimeDates(auth, userId, [dateYmd]);
  if (timed.has(dateYmd)) {
    throw conflict('Clear the time logged on this day before you mark it as a day off.');
  }
}

export async function assertTimeAllowed(auth: Authed, userId: string, periodKind: 'daily' | 'weekly', periodStart: string) {
  if (periodKind !== 'daily') return;
  const existing = await auth.db.timesheetDayOff.findUnique({
    where: { tenantId_userId_date: { tenantId: auth.tenantId, userId, date: parseYmd(periodStart) } },
  });
  if (existing) {
    throw conflict('This day is marked as a day off. Change it back to a working day first.');
  }
}

export function mapDayOff(
  row: { date: Date; kind: string; note: string | null },
  seeDetails: boolean,
) {
  const base = { date: ymdOf(row.date), label: 'Off' as const };
  if (!seeDetails) return base;
  return { ...base, kind: row.kind, note: row.note };
}

export async function applyWeekDaysOff(
  auth: Authed,
  userId: string,
  week: { weekStart: string; count: number; kind: 'leave' | 'other'; note?: string | null },
  workingDays: string[],
  weekStartSetting: 'monday' | 'sunday',
) {
  const start = weekStartFor(parseYmd(week.weekStart), weekStartSetting);
  const weekEnd = new Date(start);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const holidays = await holidaysInRange(auth, start, weekEnd);
  const holidaySet = new Set(holidays.map((row) => ymdOf(row.date)));
  const placed = placeWeeklyDaysOff({
    weekStart: start,
    count: week.count,
    workingDays,
    holidays: holidaySet,
  });
  for (const date of placed) {
    await assertDayOffAllowed(auth, userId, date, workingDays, holidaySet);
  }
  await auth.db.timesheetDayOff.deleteMany({
    where: { userId, date: { gte: start, lte: weekEnd } },
  });
  for (const date of placed) {
    await auth.db.timesheetDayOff.create({
      data: {
        tenantId: auth.tenantId,
        userId,
        date: parseYmd(date),
        kind: week.kind,
        note: week.note ?? null,
      },
    });
  }
  return placed;
}

export function expectedForPerson(input: {
  from: Date;
  to: Date;
  workingDays: string[];
  holidays: Iterable<string>;
  daysOff: Iterable<string>;
  today?: Date;
}) {
  return expectedDays(input);
}
