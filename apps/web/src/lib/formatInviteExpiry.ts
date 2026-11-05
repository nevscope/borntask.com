export function formatInviteExpiry(iso: string): string {
  const ymd = iso.slice(0, 10);
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
