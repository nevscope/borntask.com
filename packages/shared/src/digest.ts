export const DEFAULT_DIGEST_HOUR = 8;

export function digestSubject(dueCount: number, mentionCount: number): string {
  const bits: string[] = [];
  if (dueCount > 0) bits.push(`${dueCount} due`);
  if (mentionCount > 0) bits.push(`${mentionCount} mention${mentionCount === 1 ? '' : 's'}`);
  if (!bits.length) return 'Today: nothing waiting';
  return `Today: ${bits.join(', ')}`;
}

export function weekdayInZone(now: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? now.getUTCDay();
}

export function hourInZone(now: Date, timeZone: string): number {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now),
  );
  return Number.isFinite(hour) ? hour : now.getUTCHours();
}

export function dateKeyInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function isWorkday(now: Date, timeZone: string): boolean {
  const day = weekdayInZone(now, timeZone);
  return day !== 0 && day !== 6;
}

export function workingDaysBetween(from: Date, to: Date, timeZone: string): number {
  let count = 0;
  const cursor = new Date(from.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to.getTime());
  end.setUTCHours(0, 0, 0, 0);
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkday(cursor, timeZone)) count += 1;
  }
  return count;
}

export function shouldSendDigest(input: {
  digestMode: 'workdays' | 'daily' | 'off';
  emailEnabled: boolean;
  now: Date;
  timeZone: string;
  hour?: number;
  alreadySentForDate?: string | null;
}): boolean {
  if (input.digestMode === 'off') return false;
  if (!input.emailEnabled) return false;
  const hour = hourInZone(input.now, input.timeZone);
  if (hour !== (input.hour ?? DEFAULT_DIGEST_HOUR)) return false;
  if (input.digestMode === 'workdays' && !isWorkday(input.now, input.timeZone)) return false;
  const today = dateKeyInZone(input.now, input.timeZone);
  if (input.alreadySentForDate === today) return false;
  return true;
}
