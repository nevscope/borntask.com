import dayjs from 'dayjs';

export function formatWhen(iso: string): string {
  const at = dayjs(iso);
  const minutes = Math.max(1, dayjs().diff(at, 'minute'));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = dayjs().diff(at, 'hour');
  if (hours < 24) return `${hours} h ago`;
  if (dayjs().subtract(1, 'day').isSame(at, 'day')) return 'Yesterday';
  if (hours < 24 * 7) return at.format('ddd');
  return at.format('D MMM');
}
