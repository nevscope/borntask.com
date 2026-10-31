const FALLBACK_ZONES = [
  'UTC',
  'Europe/Malta',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];

export function isIanaTimeZone(zone: string): boolean {
  if (!zone || zone.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function ianaTimeZones(): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_ZONES;
  const extra = ['UTC', 'Europe/Malta', 'Europe/London'];
  return [...new Set([...extra, ...supported])].filter(isIanaTimeZone).sort((a, b) => a.localeCompare(b));
}

export function timeZoneSelectOptions() {
  return ianaTimeZones().map((value) => ({ value, label: value.replace(/_/g, ' ') }));
}
