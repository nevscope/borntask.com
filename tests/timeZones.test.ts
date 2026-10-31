import { describe, expect, test } from 'vitest';
import { ianaTimeZones, isIanaTimeZone, timeZoneSelectOptions } from '../packages/shared/src/timeZones.ts';

describe('IANA time zones', () => {
  test('accepts real zones and rejects junk', () => {
    expect(isIanaTimeZone('Europe/Malta')).toBe(true);
    expect(isIanaTimeZone('America/New_York')).toBe(true);
    expect(isIanaTimeZone('UTC')).toBe(true);
    expect(isIanaTimeZone('Not/A/Zone')).toBe(false);
    expect(isIanaTimeZone('')).toBe(false);
  });

  test('lists more than the old three shortcuts', () => {
    const zones = ianaTimeZones();
    expect(zones.length).toBeGreaterThan(50);
    expect(zones).toContain('Europe/Malta');
    expect(zones).toContain('Europe/London');
    expect(zones).toContain('Asia/Tokyo');
    expect(timeZoneSelectOptions().some((row) => row.value === 'America/Los_Angeles')).toBe(true);
  });
});
