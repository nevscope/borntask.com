import dayjs from 'dayjs';
import { color } from '../theme/tokens';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function nextWeekday(target: number) {
  const today = dayjs();
  const delta = (target - today.day() + 7) % 7 || 7;
  return today.add(delta, 'day');
}

/** Turns a short phrase such as "fri" or "tomorrow" into YYYY-MM-DD. */
export function parseDuePhrase(raw: string): string | null {
  const w = raw.trim().toLowerCase();
  if (!w) return null;
  if (w === 'today') return dayjs().format('YYYY-MM-DD');
  if (w === 'tomorrow' || w === 'tmrw') return dayjs().add(1, 'day').format('YYYY-MM-DD');
  if (w === 'next week' || w === 'next monday') return nextWeekday(1).format('YYYY-MM-DD');
  const day = WEEKDAYS.indexOf(w.slice(0, 3));
  if (WEEKDAYS.includes(w.slice(0, 3)) && w.length <= 3) return nextWeekday(day).format('YYYY-MM-DD');
  const parsed = dayjs(raw);
  if (parsed.isValid() && /\d/.test(raw)) return parsed.format('YYYY-MM-DD');
  return null;
}

export function dueLabel(date: string | null): string {
  if (!date) return 'No date';
  const d = dayjs(date);
  const diff = d.startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.format('ddd D MMM');
  return d.format('D MMM');
}

export type DueTone = 'overdue' | 'today' | 'normal' | 'none';

export function dueTone(date: string | null): DueTone {
  if (!date) return 'none';
  const diff = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'normal';
}

export const dueColor: Record<DueTone, string> = {
  overdue: color.danger,
  today: color.brandStrong,
  normal: color.ink3,
  none: color.muted,
};

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export function dueBucket(date: string | null): DueBucket {
  if (!date) return 'none';
  const diff = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}
