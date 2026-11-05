import { describe, expect, test } from 'vitest';
import {
  CANVAS_REPORTS_FIXTURE,
  completedAtForMove,
  countsAsClosed,
  dayOffKindSchema,
  clipTimesheetFrom,
  expectedDays,
  lastEndedDayInZone,
  memberFillsTimesheets,
  calendarDayInZone,
  holidayDatesForCountry,
  resolveHolidayCountry,
  timesheetExpectedStart,
  timesheetPersonStart,
  formatMixedTotals,
  formatWorkspaceTotals,
  formatMinutes,
  isTimesheetLocked,
  loggedExpectedDays,
  parseOptionalWorkingDays,
  parseTimeToMinutes,
  parseYmd,
  resolveMemberWorkingDays,
  placeWeeklyDaysOff,
  rollupCompleteness,
  putDaysOffSchema,
  putTimesheetsSchema,
  timesheetEntryWriteSchema,
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

describe('timesheet lock window', () => {
  const today = parseYmd('2026-10-31');

  test('default week still allows last week and locks the week before', () => {
    expect(isTimesheetLocked({ periodStart: parseYmd('2026-10-26'), periodKind: 'weekly', editDays: 7, today })).toBe(false);
    expect(isTimesheetLocked({ periodStart: parseYmd('2026-10-19'), periodKind: 'weekly', editDays: 7, today })).toBe(false);
    expect(isTimesheetLocked({ periodStart: parseYmd('2026-10-12'), periodKind: 'weekly', editDays: 7, today })).toBe(true);
  });

  test('daily cells lock once they are older than the window', () => {
    expect(isTimesheetLocked({ periodStart: parseYmd('2026-10-24'), periodKind: 'daily', editDays: 7, today })).toBe(false);
    expect(isTimesheetLocked({ periodStart: parseYmd('2026-10-23'), periodKind: 'daily', editDays: 7, today })).toBe(true);
  });

  test('never lock when editDays is -1', () => {
    expect(isTimesheetLocked({ periodStart: parseYmd('2020-01-01'), periodKind: 'daily', editDays: -1, today })).toBe(false);
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

describe('parseTimeToMinutes and cell cap', () => {
  test('accepts colon, decimal and comma hours, and formats H:MM', () => {
    expect(parseTimeToMinutes('1:30')).toBe(90);
    expect(parseTimeToMinutes('2.5')).toBe(150);
    expect(parseTimeToMinutes('1,5')).toBe(90);
    expect(parseTimeToMinutes('24:00')).toBe(24 * 60);
    expect(formatMinutes(90)).toBe('1:30');
  });

  test('rejects junk, negatives, minutes of 60 or more, and more than 24:00', () => {
    expect(parseTimeToMinutes('abc')).toBeNull();
    expect(parseTimeToMinutes('-1')).toBeNull();
    expect(parseTimeToMinutes('0:75')).toBeNull();
    expect(parseTimeToMinutes('24:01')).toBeNull();
    expect(parseTimeToMinutes('24.1')).toBeNull();
    expect(parseTimeToMinutes('25')).toBeNull();
  });

  test('write schema minutes max is 24 hours per cell', () => {
    expect(timesheetEntryWriteSchema.safeParse({
      projectId: 'p1',
      periodKind: 'daily',
      periodStart: '2026-11-01',
      unit: 'time',
      minutes: 24 * 60,
    }).success).toBe(true);
    expect(timesheetEntryWriteSchema.safeParse({
      projectId: 'p1',
      periodKind: 'daily',
      periodStart: '2026-11-01',
      unit: 'time',
      minutes: 24 * 60 + 1,
    }).success).toBe(false);
  });

  test('put schemas accept an optional userId', () => {
    expect(putTimesheetsSchema.safeParse({ entries: [] }).success).toBe(true);
    expect(putTimesheetsSchema.safeParse({ userId: 'u1', entries: [] }).success).toBe(true);
    expect(putDaysOffSchema.safeParse({ userId: 'u1', days: [] }).success).toBe(true);
  });
});

describe('timesheet start date', () => {
  test('1 Nov 2026 with a 2 Nov start has 0 expected working days so far', () => {
    expect(
      expectedDays({
        from: parseYmd('2026-11-01'),
        to: parseYmd('2026-11-30'),
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        today: parseYmd('2026-11-01'),
        startOn: parseYmd('2026-11-02'),
      }),
    ).toBe(0);
  });

  test('expected days ignore dates before timesheets start', () => {
    expect(
      expectedDays({
        from: parseYmd('2026-10-01'),
        to: parseYmd('2026-11-06'),
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        today: parseYmd('2026-11-06'),
        startOn: parseYmd('2026-11-02'),
      }),
    ).toBe(5);
  });

  test('clipTimesheetFrom raises the range start', () => {
    expect(clipTimesheetFrom(parseYmd('2026-10-01'), parseYmd('2026-11-02')).toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(clipTimesheetFrom(parseYmd('2026-11-09'), parseYmd('2026-11-02')).toISOString().slice(0, 10)).toBe('2026-11-09');
  });

  test('person start is the later of workspace start and join date', () => {
    expect(timesheetPersonStart(parseYmd('2026-11-02'), parseYmd('2026-09-01'))?.toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(timesheetPersonStart(parseYmd('2026-11-02'), parseYmd('2026-11-16'))?.toISOString().slice(0, 10)).toBe('2026-11-16');
    expect(timesheetPersonStart(null, parseYmd('2026-11-16'))?.toISOString().slice(0, 10)).toBe('2026-11-16');
  });

  test('inherited working days ignore join date for expected start', () => {
    expect(
      timesheetExpectedStart({
        workspaceStart: parseYmd('2026-10-01'),
        joinedAt: parseYmd('2026-11-01'),
        memberWorkingDays: null,
      })?.toISOString().slice(0, 10),
    ).toBe('2026-10-01');
    expect(
      expectedDays({
        from: parseYmd('2026-10-26'),
        to: parseYmd('2026-11-01'),
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        today: parseYmd('2026-11-01'),
        startOn: timesheetExpectedStart({
          workspaceStart: parseYmd('2026-10-01'),
          joinedAt: parseYmd('2026-11-01'),
          memberWorkingDays: [],
        }),
      }),
    ).toBe(5);
  });

  test('mixed totals keep hours and percent separate', () => {
    expect(formatMixedTotals(120, 0)).toBe('2:00');
    expect(formatMixedTotals(150, 0)).toBe('2:30');
    expect(formatMixedTotals(0, 40)).toBe('40%');
    expect(formatMixedTotals(120, 40)).toBe('2:00 + 40%');
  });

  test('percent workspace totals never look like silent hours', () => {
    expect(formatWorkspaceTotals(140, 0, 'percent')).toBe('2:20 leftover');
    expect(formatWorkspaceTotals(140, 0, 'percent', true)).toBe('2:20 h');
    expect(formatWorkspaceTotals(0, 40, 'percent')).toBe('40%');
    expect(formatWorkspaceTotals(270, 2, 'percent')).toBe('4:30 leftover + 2%');
    expect(formatWorkspaceTotals(140, 0, 'time')).toBe('2:20');
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

  test('0 of 0 is none, not complete; expected 0 with time is extra', () => {
    const empty = rollupCompleteness({
      from: parseYmd('2026-11-01'),
      to: parseYmd('2026-11-30'),
      workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      holidays: [],
      today: parseYmd('2026-11-01'),
      startOn: parseYmd('2026-11-02'),
      people: [
        { userId: 'a', daysWithTime: 0, daysOff: 0 },
        { userId: 'b', daysWithTime: 1, daysOff: 0 },
      ],
    });
    expect(empty.expectedBase).toBe(0);
    expect(empty.complete).toBe(0);
    expect(empty.none).toBe(1);
    expect(empty.extra).toBe(1);
  });

  test('Tue+Thu pattern: logging both expected days is complete', () => {
    const workingDays = ['tue', 'thu'];
    const from = parseYmd('2026-10-26');
    const to = parseYmd('2026-11-01');
    const today = parseYmd('2026-11-01');
    expect(
      expectedDays({
        from,
        to,
        workingDays,
        today,
      }),
    ).toBe(2);
    expect(
      expectedDays({
        from,
        to,
        workingDays,
        holidays: ['2026-10-27'],
        today,
      }),
    ).toBe(1);
    expect(
      expectedDays({
        from,
        to,
        workingDays,
        daysOff: ['2026-10-29'],
        today,
      }),
    ).toBe(1);
    const expectedDates = [parseYmd('2026-10-27'), parseYmd('2026-10-29')];
    expect(loggedExpectedDays(['2026-10-27', '2026-10-29'], expectedDates)).toBe(2);
    expect(resolveMemberWorkingDays(['tue', 'thu'], ['mon', 'tue', 'wed', 'thu', 'fri'])).toEqual(['tue', 'thu']);
    expect(parseOptionalWorkingDays(null)).toBeNull();
    expect(parseOptionalWorkingDays([])).toBeNull();
    expect(resolveMemberWorkingDays([], ['mon', 'tue', 'wed', 'thu', 'fri'])).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(resolveMemberWorkingDays(null, ['mon', 'tue', 'wed', 'thu', 'fri'])).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
  });

  test('two countries, two people, same week, different expected', () => {
    const from = parseYmd('2026-10-26');
    const to = parseYmd('2026-11-01');
    const today = parseYmd('2026-11-01');
    const workingDays = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const holidays = [
      { date: '2026-10-28', countryCode: null },
      { date: '2026-10-26', countryCode: 'MT' },
      { date: '2026-10-27', countryCode: 'MT' },
      { date: '2026-10-30', countryCode: 'IT' },
    ];
    const malta = holidayDatesForCountry(holidays, resolveHolidayCountry('MT', 'MT'));
    const italy = holidayDatesForCountry(holidays, resolveHolidayCountry('IT', 'MT'));
    const workspaceHeader = holidayDatesForCountry(holidays, resolveHolidayCountry(null, 'MT'));
    expect(malta.sort()).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(italy.sort()).toEqual(['2026-10-28', '2026-10-30']);
    expect(workspaceHeader.sort()).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(expectedDays({ from, to, workingDays, holidays: malta, today })).toBe(2);
    expect(expectedDays({ from, to, workingDays, holidays: italy, today })).toBe(3);
    expect(expectedDays({ from, to, workingDays, holidays: workspaceHeader, today })).toBe(2);
  });

  test('logged days against expected ignore Saturday unless it is a working day', () => {
    const expected = [parseYmd('2026-10-30')];
    expect(loggedExpectedDays(['2026-10-30', '2026-10-31'], expected)).toBe(1);
    expect(loggedExpectedDays(['2026-10-31'], expected)).toBe(0);
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

describe('who fills timesheets', () => {
  test('members and owners fill unless exempt; guests and viewers never fill', () => {
    expect(memberFillsTimesheets({ workspaceRole: 'owner' })).toBe(true);
    expect(memberFillsTimesheets({ workspaceRole: 'admin' })).toBe(true);
    expect(memberFillsTimesheets({ workspaceRole: 'member' })).toBe(true);
    expect(memberFillsTimesheets({ workspaceRole: 'member', timesheetsExempt: false })).toBe(true);
    expect(memberFillsTimesheets({ workspaceRole: 'member', timesheetsExempt: true })).toBe(false);
    expect(memberFillsTimesheets({ workspaceRole: 'owner', timesheetsExempt: true })).toBe(false);
    expect(memberFillsTimesheets({ workspaceRole: 'guest' })).toBe(false);
    expect(memberFillsTimesheets({ workspaceRole: 'viewer' })).toBe(false);
    expect(memberFillsTimesheets({ workspaceRole: 'guest', timesheetsExempt: false })).toBe(false);
  });
});

describe('missing days wait until the day has ended', () => {
  test('workspace Europe/Malta: Thursday morning does not count Thursday', () => {
    const now = new Date('2026-11-05T08:30:00.000Z');
    expect(calendarDayInZone(now, 'Europe/Malta').toISOString().slice(0, 10)).toBe('2026-11-05');
    expect(lastEndedDayInZone(now, 'Europe/Malta').toISOString().slice(0, 10)).toBe('2026-11-04');
    expect(
      expectedDays({
        from: parseYmd('2026-11-01'),
        to: parseYmd('2026-11-30'),
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        today: lastEndedDayInZone(now, 'Europe/Malta'),
      }),
    ).toBe(3);
  });

  test('same instant uses the named zone, not UTC', () => {
    const now = new Date('2026-11-05T00:30:00.000Z');
    expect(lastEndedDayInZone(now, 'Europe/Malta').toISOString().slice(0, 10)).toBe('2026-11-04');
    expect(lastEndedDayInZone(now, 'UTC').toISOString().slice(0, 10)).toBe('2026-11-04');
    expect(lastEndedDayInZone(now, 'Pacific/Honolulu').toISOString().slice(0, 10)).toBe('2026-11-03');
  });
});
