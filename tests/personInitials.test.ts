import { describe, expect, it } from 'vitest';
import { assignUniqueInitials, personInitials } from '@borntask/shared';

describe('personInitials', () => {
  it('uses first and last letters for two names', () => {
    expect(personInitials('QA Guest')).toBe('QG');
  });

  it('distinguishes people who would otherwise share first and last letters', () => {
    const [guest, tsGuest] = assignUniqueInitials(['QA Guest', 'QA TS Guest']);
    expect(guest).toBe('QG');
    expect(tsGuest).not.toBe(guest);
    expect(tsGuest).toBe('QA');
  });
});
