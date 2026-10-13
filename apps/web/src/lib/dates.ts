import dayjs from 'dayjs';

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
  overdue: '#B42323',
  today: '#0F6B46',
  normal: '#3A3F38',
  none: '#5B6157',
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
