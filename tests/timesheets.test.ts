import { describe, expect, test } from 'vitest';
import {
  CANVAS_REPORTS_FIXTURE,
  completedAtForMove,
  countsAsClosed,
  dayOffKindSchema,
  expectedDays,
  formatMinutes,
  parseYmd,
  placeWeeklyDaysOff,
  rollupCompleteness,
  weekStartFor,
} from '../packages/shared/src/timesheets.ts';
import { ApiError, conflict } from '../apps/api/src/errors.ts';

describe('timesheet dates and week start', () => {
  test('monday week start lands on 26 Oct 2026 for that Wednesday', () => {
    expect(weekStartFor(parseYmd('2026-10-28'), 'monday').toISOString().slice(0, 10)).toBe('2026-10-26');
  });

  test('sunday week start lands on 25 Oct 2026 for that Wednesday', () => {
    expect(weekStartFor(parseYmd('2026-10-28'), 'sunday').toISOString().slice(0, 10)).toBe('2026-10-25');
  });

  test('weekly days off skip holidays and fill the first working days', () => {
    expect(
      placeWeeklyDaysOff({
        weekStart: parseYmd('2026-10-26'),
        count: 2,
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        holidays: ['2026-10-28'],
      }),
    ).toEqual(['2026-10-26', '2026-10-27']);
  });
});

describe('days off rules', () => {
  test('kinds are Leave and Other only', () => {
    expect(dayOffKindSchema.safeParse('leave').success).toBe(true);
    expect(dayOffKindSchema.safeParse('other').success).toBe(true);
    expect(dayOffKindSchema.safeParse('sick').success).toBe(false);
  });

  test('409 copy when time is already logged', () => {
    const err = conflict('Clear the time logged on this day before you mark it as a day off.');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toContain('Clear the time');
    expect(err.message).not.toMatch(/[—–]/);
  });

  test('409 copy when the date is not a working day', () => {
    const err = conflict('That date is not a working day.');
    expect(err.status).toBe(409);
    expect(err.message).toBe('That date is not a working day.');
  });
});

describe('completeness and canvas fixture', () => {
  test('October 2026 through 30 Oct with one holiday is 21 expected days', () => {
    expect(
      expectedDays({
        from: parseYmd(CANVAS_REPORTS_FIXTURE.from),
        to: parseYmd(CANVAS_REPORTS_FIXTURE.to),
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        holidays: [CANVAS_REPORTS_FIXTURE.holiday],
        today: parseYmd(CANVAS_REPORTS_FIXTURE.today),
      }),
    ).toBe(21);
  });

  test('canvas rollup matches 659:30, 4 complete, 25 missing days, 7 days off', () => {
    const rollup = rollupCompleteness({
      from: parseYmd(CANVAS_REPORTS_FIXTURE.from),
      to: parseYmd(CANVAS_REPORTS_FIXTURE.to),
      workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      holidays: [CANVAS_REPORTS_FIXTURE.holiday],
      today: parseYmd(CANVAS_REPORTS_FIXTURE.today),
      people: [...CANVAS_REPORTS_FIXTURE.people],
    });
    expect(formatMinutes(CANVAS_REPORTS_FIXTURE.minutes)).toBe('659:30');
    expect(rollup.complete).toBe(4);
    expect(rollup.missingDays).toBe(25);
    expect(rollup.daysOff).toBe(7);
    expect(CANVAS_REPORTS_FIXTURE.opened).toBe(48);
    expect(CANVAS_REPORTS_FIXTURE.closed).toBe(41);
    expect(CANVAS_REPORTS_FIXTURE.open).toBe(63);
    expect(CANVAS_REPORTS_FIXTURE.overdue).toBe(7);
  });
});

describe('closed and reopen', () => {
  test('rejected and deployed both count as closed', () => {
    expect(countsAsClosed('done')).toBe(true);
    expect(countsAsClosed('active')).toBe(false);
  });

  test('reopen clears completedAt', () => {
    expect(completedAtForMove('done')).toBeInstanceOf(Date);
    expect(completedAtForMove('active')).toBeNull();
    expect(completedAtForMove('review')).toBeNull();
  });
});
