import { z } from 'zod';

export const timesheetPeriodSchema = z.enum(['daily', 'weekly']);
export const timesheetUnitSchema = z.enum(['time', 'percent']);
export const dayOffKindSchema = z.enum(['leave', 'other']);
export const weekdayKeySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD.');

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const DEFAULT_WORKING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;

export const workingDaysSchema = z
  .array(weekdayKeySchema)
  .min(1, 'Choose at least one working day.')
  .superRefine((days, ctx) => {
    if (new Set(days).size !== days.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Working days must be unique.' });
    }
  });

export const patchWorkspaceTimesheetSchema = z.object({
  timesheetPeriod: timesheetPeriodSchema.optional(),
  timesheetUnit: timesheetUnitSchema.optional(),
  workingDays: workingDaysSchema.optional(),
});

export const holidayItemSchema = z.object({
  date: ymdSchema,
  name: z.string().trim().min(1, 'Enter a holiday name.').max(80, 'Name must be 80 characters or fewer.'),
});

export const putHolidaysSchema = z.object({
  holidays: z.array(holidayItemSchema),
});

export const addHolidaySchema = holidayItemSchema;

export const copyHolidaysSchema = z.object({
  from: z.number().int().min(2000).max(2100),
  to: z.number().int().min(2000).max(2100),
});

export const timesheetRangeQuerySchema = z.object({
  from: ymdSchema,
  to: ymdSchema,
  userId: z.string().min(1).optional(),
});

export const timesheetEntryWriteSchema = z.object({
  projectId: z.string().min(1),
  periodKind: timesheetPeriodSchema,
  periodStart: ymdSchema,
  unit: timesheetUnitSchema,
  minutes: z.number().int().min(0).max(24 * 60 * 14).nullable().optional(),
  percent: z.number().int().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  clear: z.boolean().optional(),
});

export const putTimesheetsSchema = z.object({
  entries: z.array(timesheetEntryWriteSchema),
});

export const dayOffWriteSchema = z.object({
  date: ymdSchema,
  kind: dayOffKindSchema.optional(),
  note: z.string().trim().max(200).nullable().optional(),
  clear: z.boolean().optional(),
});

export const weekDaysOffSchema = z.object({
  weekStart: ymdSchema,
  count: z.number().int().min(0).max(7),
  kind: dayOffKindSchema,
  note: z.string().trim().max(200).nullable().optional(),
});

export const putDaysOffSchema = z.object({
  days: z.array(dayOffWriteSchema).optional(),
  week: weekDaysOffSchema.optional(),
});

export const reportsQuerySchema = z.object({
  from: ymdSchema,
  to: ymdSchema,
  projectId: z.string().min(1).optional(),
});

const MOVABLE_HOLIDAY = /good friday|easter|ascension|pentecost|whit |corpus christi/i;

export function isMovableHolidayName(name: string): boolean {
  return MOVABLE_HOLIDAY.test(name);
}

export function parseWorkingDays(value: unknown): z.infer<typeof weekdayKeySchema>[] {
  const parsed = workingDaysSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return [...DEFAULT_WORKING_DAYS];
}

export function parseYmd(value: string): Date {
  const parts = value.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function weekdayKey(date: Date): z.infer<typeof weekdayKeySchema> {
  return WEEKDAY_KEYS[date.getUTCDay()] as z.infer<typeof weekdayKeySchema>;
}

export function isWorkingDay(date: Date, workingDays: string[]): boolean {
  return workingDays.includes(weekdayKey(date));
}

export function weekStartFor(date: Date, weekStart: 'monday' | 'sunday'): Date {
  const day = date.getUTCDay();
  const offset = weekStart === 'sunday' ? day : (day + 6) % 7;
  return addUtcDays(date, -offset);
}

export function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let cursor = from; cursor.getTime() <= to.getTime(); cursor = addUtcDays(cursor, 1)) {
    out.push(cursor);
  }
  return out;
}

export function workingDatesInRange(input: {
  from: Date;
  to: Date;
  workingDays: string[];
  holidays?: Iterable<string>;
  today?: Date;
}): Date[] {
  const cap = input.today && input.today.getTime() < input.to.getTime() ? input.today : input.to;
  const holidaySet = new Set(input.holidays ?? []);
  return eachDate(input.from, cap).filter((date) => {
    const ymd = formatYmd(date);
    return isWorkingDay(date, input.workingDays) && !holidaySet.has(ymd);
  });
}

export function expectedDays(input: {
  from: Date;
  to: Date;
  workingDays: string[];
  holidays?: Iterable<string>;
  daysOff?: Iterable<string>;
  today?: Date;
}): number {
  const off = new Set(input.daysOff ?? []);
  return workingDatesInRange(input).filter((date) => !off.has(formatYmd(date))).length;
}

export function missingDays(expected: number, daysWithTime: number): number {
  return Math.max(0, expected - daysWithTime);
}

export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

export function parseTimeToMinutes(value: string): number | null {
  const trimmed = value.trim();
  const colon = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const decimal = trimmed.match(/^(\d+)(?:\.(\d+))?$/);
  if (decimal) return Math.round(Number(trimmed) * 60);
  return null;
}

export function placeWeeklyDaysOff(input: {
  weekStart: Date;
  count: number;
  workingDays: string[];
  holidays?: Iterable<string>;
}): string[] {
  const holidays = new Set(input.holidays ?? []);
  const weekEnd = addUtcDays(input.weekStart, 6);
  const days = eachDate(input.weekStart, weekEnd).filter((date) => {
    return isWorkingDay(date, input.workingDays) && !holidays.has(formatYmd(date));
  });
  return days.slice(0, input.count).map(formatYmd);
}

export function countsAsClosed(category: string): boolean {
  return category === 'done';
}

export function completedAtForMove(category: string, now = new Date()): Date | null {
  return countsAsClosed(category) ? now : null;
}

export type CompletenessPerson = {
  userId: string;
  daysWithTime: number;
  daysOff: number;
};

export function rollupCompleteness(input: {
  from: Date;
  to: Date;
  workingDays: string[];
  holidays: Iterable<string>;
  today?: Date;
  people: CompletenessPerson[];
}): { complete: number; missingDays: number; daysOff: number; expectedBase: number } {
  const expectedBase = workingDatesInRange({
    from: input.from,
    to: input.to,
    workingDays: input.workingDays,
    holidays: input.holidays,
    today: input.today,
  }).length;
  let complete = 0;
  let missing = 0;
  let daysOff = 0;
  for (const person of input.people) {
    const expected = Math.max(0, expectedBase - person.daysOff);
    const miss = missingDays(expected, person.daysWithTime);
    if (person.daysWithTime === expected) complete += 1;
    missing += miss;
    daysOff += person.daysOff;
  }
  return { complete, missingDays: missing, daysOff, expectedBase };
}

export const CANVAS_REPORTS_FIXTURE = {
  from: '2026-10-01',
  to: '2026-10-31',
  today: '2026-10-30',
  holiday: '2026-10-13',
  minutes: 39_570,
  timeLabel: '659:30',
  opened: 48,
  closed: 41,
  open: 63,
  overdue: 7,
  people: [
    { userId: 'kf', daysWithTime: 21, daysOff: 0 },
    { userId: 'lc', daysWithTime: 21, daysOff: 0 },
    { userId: 'sc', daysWithTime: 20, daysOff: 0 },
    { userId: 'mb', daysWithTime: 21, daysOff: 0 },
    { userId: 'dv', daysWithTime: 19, daysOff: 2 },
    { userId: 'eg', daysWithTime: 13, daysOff: 5 },
    { userId: 'mc', daysWithTime: 0, daysOff: 0 },
  ],
} as const;
