export type GanttScale = 'week' | 'month';

export type GanttBarKind = 'range' | 'dueOnly' | 'unscheduled';

export type GanttBar = {
  kind: GanttBarKind;
  start: string | null;
  end: string | null;
};

export type GanttWindow = {
  from: string;
  to: string;
};

export type GanttBarLayout = {
  left: number;
  width: number;
};

export type GanttOnTrackRow = {
  startDate?: string | null;
  dueDate?: string | null;
  isBlocked?: boolean;
  /** Open work. Defaults to true. Closed work is never overdue. */
  open?: boolean;
};

export type GanttOnTrack = {
  overdue: number;
  blocked: number;
  unscheduled: number;
  dated: number;
  summary: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

function ymd(value: string): string {
  return value.trim();
}

function utcDate(value: string): Date {
  const [year, month, day] = ymd(value).split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

function dayIndex(value: string): number {
  return Math.round(utcDate(value).getTime() / 86_400_000);
}

function inclusiveDays(from: string, to: string): number {
  return dayIndex(to) - dayIndex(from) + 1;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

function monthStart(today: string): string {
  return `${ymd(today).slice(0, 7)}-01`;
}

function monthEnd(today: string): string {
  const date = utcDate(`${ymd(today).slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return formatYmd(date);
}

/** True when either date is missing, or start is on or before due (YYYY-MM-DD). */
export function startNotAfterDue(
  start: string | null | undefined,
  due: string | null | undefined,
): boolean {
  if (blank(start) || blank(due)) return true;
  return ymd(start!) <= ymd(due!);
}

export function ganttBar(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
): GanttBar {
  const start = blank(startDate) ? null : ymd(startDate!);
  const due = blank(dueDate) ? null : ymd(dueDate!);
  if (!start && !due) return { kind: 'unscheduled', start: null, end: null };
  if (start && due) return { kind: 'range', start, end: due };
  if (due) return { kind: 'dueOnly', start: due, end: due };
  return { kind: 'range', start, end: start };
}

/** Inclusive day cap so a bad start/due date cannot allocate millions of cells. */
export const GANTT_MAX_DAYS = 400;

export function ganttWindow(
  bars: GanttBar[],
  today: string,
  scale: GanttScale,
): GanttWindow {
  const day = ymd(today);
  let from = day;
  let to = day;
  for (const bar of bars) {
    if (bar.kind === 'unscheduled' || !bar.start || !bar.end) continue;
    const start = minYmd(bar.start, bar.end);
    const end = maxYmd(bar.start, bar.end);
    from = minYmd(from, start);
    to = maxYmd(to, end);
  }
  if (scale === 'week') {
    if (inclusiveDays(from, to) < 14) to = addDays(from, 13);
  } else {
    from = minYmd(from, monthStart(day));
    to = maxYmd(to, monthEnd(day));
  }
  if (inclusiveDays(from, to) <= GANTT_MAX_DAYS) return { from, to };
  const before = Math.floor((GANTT_MAX_DAYS - 1) / 2);
  from = addDays(day, -before);
  to = addDays(from, GANTT_MAX_DAYS - 1);
  return { from, to };
}

export function ganttDays(from: string, to: string): string[] {
  const start = ymd(from);
  const end = ymd(to);
  if (end < start) return [];
  const days: string[] = [];
  let cursor = start;
  for (let i = 0; i < GANTT_MAX_DAYS && cursor <= end; i += 1) {
    days.push(cursor);
    const next = addDays(cursor, 1);
    if (next === cursor) break;
    cursor = next;
  }
  return days;
}

export function ganttBarLayout(
  bar: GanttBar,
  from: string,
  to: string,
  dayPx: number,
): GanttBarLayout | null {
  if (bar.kind === 'unscheduled' || !bar.start || !bar.end || dayPx <= 0) return null;
  if (!YMD.test(ymd(from)) || !YMD.test(ymd(to))) return null;
  const barStart = minYmd(bar.start, bar.end);
  const barEnd = maxYmd(bar.start, bar.end);
  const windowFrom = ymd(from);
  const windowTo = ymd(to);
  if (barEnd < windowFrom || barStart > windowTo) return null;
  const visibleStart = maxYmd(barStart, windowFrom);
  const visibleEnd = minYmd(barEnd, windowTo);
  const left = (dayIndex(visibleStart) - dayIndex(windowFrom)) * dayPx;
  const width = Math.max(1, inclusiveDays(visibleStart, visibleEnd)) * dayPx;
  return { left, width };
}

export function ganttOnTrack(rows: GanttOnTrackRow[], today: string): GanttOnTrack {
  const day = ymd(today);
  let overdue = 0;
  let blocked = 0;
  let unscheduled = 0;
  let dated = 0;
  for (const row of rows) {
    const bar = ganttBar(row.startDate, row.dueDate);
    if (bar.kind === 'unscheduled') unscheduled += 1;
    else dated += 1;
    if (row.isBlocked) blocked += 1;
    const open = row.open !== false;
    const due = blank(row.dueDate) ? null : ymd(row.dueDate!);
    if (open && due && due < day) overdue += 1;
  }
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (blocked) parts.push(`${blocked} blocked`);
  if (unscheduled) parts.push(`${unscheduled} unscheduled`);
  const summary =
    overdue === 0 ? 'On track - no overdue work' : parts.join(', ');
  return { overdue, blocked, unscheduled, dated, summary };
}
