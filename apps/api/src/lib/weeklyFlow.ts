import { addUtcDays, formatYmd, parseYmd } from '@borntask/shared';

export type WeekFlow = { week: string; label: string; opened: number; closed: number };

function mondayOf(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (day.getUTCDay() + 6) % 7;
  return addUtcDays(day, -offset);
}

function weekLabel(week: string): string {
  const date = parseYmd(week);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}

/** Monday-start weeks covering the report range. Dates outside the buckets are ignored. */
export function weeklyCreatedClosed(opened: Date[], closed: Date[], from: string, to: string): WeekFlow[] {
  const start = mondayOf(parseYmd(from));
  const end = mondayOf(parseYmd(to));
  const buckets = new Map<string, WeekFlow>();
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, 7)) {
    const week = formatYmd(cursor);
    buckets.set(week, { week, label: weekLabel(week), opened: 0, closed: 0 });
  }
  for (const date of opened) {
    const row = buckets.get(formatYmd(mondayOf(date)));
    if (row) row.opened += 1;
  }
  for (const date of closed) {
    const row = buckets.get(formatYmd(mondayOf(date)));
    if (row) row.closed += 1;
  }
  return [...buckets.values()];
}
