import { describe, expect, it } from 'vitest';
import {
  ganttBar,
  ganttBarLayout,
  ganttDays,
  ganttOnTrack,
  ganttWindow,
  startNotAfterDue,
} from '../packages/shared/src/gantt.ts';

describe('ganttBar', () => {
  it('builds a range when start and due are set', () => {
    expect(ganttBar('2026-11-02', '2026-11-10')).toEqual({
      kind: 'range',
      start: '2026-11-02',
      end: '2026-11-10',
    });
  });

  it('places a one-day bar on due when start is missing', () => {
    expect(ganttBar(null, '2026-11-10')).toEqual({
      kind: 'dueOnly',
      start: '2026-11-10',
      end: '2026-11-10',
    });
    expect(ganttBar('', '2026-11-10').kind).toBe('dueOnly');
  });

  it('is unscheduled when neither date is set', () => {
    expect(ganttBar(null, null)).toEqual({ kind: 'unscheduled', start: null, end: null });
    expect(ganttBar('', '')).toEqual({ kind: 'unscheduled', start: null, end: null });
  });
});

describe('startNotAfterDue', () => {
  it('allows missing dates', () => {
    expect(startNotAfterDue(null, '2026-11-10')).toBe(true);
    expect(startNotAfterDue('2026-11-02', null)).toBe(true);
    expect(startNotAfterDue('', '')).toBe(true);
  });

  it('is true when start is on or before due', () => {
    expect(startNotAfterDue('2026-11-02', '2026-11-10')).toBe(true);
    expect(startNotAfterDue('2026-11-10', '2026-11-10')).toBe(true);
  });

  it('is false when start is after due', () => {
    expect(startNotAfterDue('2026-11-11', '2026-11-10')).toBe(false);
  });
});

describe('ganttWindow', () => {
  it('pads a week window to at least 14 days around today when there are no bars', () => {
    expect(ganttWindow([], '2026-11-06', 'week')).toEqual({
      from: '2026-11-06',
      to: '2026-11-19',
    });
  });

  it('covers dated bars and still pads a short week span to 14 days', () => {
    const bars = [ganttBar('2026-11-08', '2026-11-10')];
    expect(ganttWindow(bars, '2026-11-06', 'week')).toEqual({
      from: '2026-11-06',
      to: '2026-11-19',
    });
  });

  it('covers the current month on month scale even with a short bar', () => {
    const bars = [ganttBar('2026-11-08', '2026-11-10')];
    expect(ganttWindow(bars, '2026-11-06', 'month')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });

  it('extends a month window when bars fall outside the current month', () => {
    const bars = [ganttBar('2026-10-28', '2026-12-02')];
    expect(ganttWindow(bars, '2026-11-06', 'month')).toEqual({
      from: '2026-10-28',
      to: '2026-12-02',
    });
  });

  it('clamps a multi-year bar so the window stays bounded', () => {
    const bars = [ganttBar('1990-01-01', '2090-12-31')];
    const window = ganttWindow(bars, '2026-11-06', 'month');
    const days = ganttDays(window.from, window.to);
    expect(days.length).toBeLessThanOrEqual(400);
    expect(days.length).toBeGreaterThan(300);
    expect(days.includes('2026-11-06')).toBe(true);
  });
});

describe('ganttDays', () => {
  it('lists inclusive YYYY-MM-DD days', () => {
    expect(ganttDays('2026-11-08', '2026-11-10')).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ]);
  });
});

describe('ganttBarLayout', () => {
  const from = '2026-11-01';
  const to = '2026-11-14';
  const dayPx = 20;

  it('places a range from the window start with width of inclusive days', () => {
    expect(ganttBarLayout(ganttBar('2026-11-01', '2026-11-03'), from, to, dayPx)).toEqual({
      left: 0,
      width: 60,
    });
  });

  it('offsets a due-only bar by one day of pixels', () => {
    expect(ganttBarLayout(ganttBar(null, '2026-11-02'), from, to, dayPx)).toEqual({
      left: 20,
      width: 20,
    });
  });

  it('returns null for unscheduled or fully outside bars', () => {
    expect(ganttBarLayout(ganttBar(null, null), from, to, dayPx)).toBeNull();
    expect(ganttBarLayout(ganttBar('2026-10-01', '2026-10-05'), from, to, dayPx)).toBeNull();
    expect(ganttBarLayout(ganttBar('2026-11-20', '2026-11-22'), from, to, dayPx)).toBeNull();
  });

  it('clips a bar that starts before the window and keeps at least one day of width', () => {
    expect(ganttBarLayout(ganttBar('2026-10-30', '2026-11-01'), from, to, dayPx)).toEqual({
      left: 0,
      width: 20,
    });
  });
});

describe('ganttOnTrack', () => {
  it('counts overdue, blocked, unscheduled and dated rows', () => {
    const result = ganttOnTrack(
      [
        { dueDate: '2026-11-01', open: true },
        { dueDate: '2026-11-02', open: true },
        { dueDate: '2026-11-03', open: true },
        { startDate: '2026-11-08', dueDate: '2026-11-12', isBlocked: true },
        { startDate: '2026-11-10', dueDate: '2026-11-14', isBlocked: true },
        { startDate: null, dueDate: null },
        { startDate: '', dueDate: '' },
        {},
        {},
        {},
        {},
        {},
        {},
        { startDate: '2026-11-08', dueDate: '2026-11-20' },
        { dueDate: '2026-11-10' },
        { dueDate: '2026-10-01', open: false },
      ],
      '2026-11-06',
    );
    expect(result.overdue).toBe(3);
    expect(result.blocked).toBe(2);
    expect(result.unscheduled).toBe(8);
    expect(result.dated).toBe(8);
    expect(result.summary).toBe('3 overdue, 2 blocked, 8 unscheduled');
  });

  it('uses British copy with a hyphen when nothing is overdue', () => {
    const result = ganttOnTrack(
      [
        { startDate: '2026-11-08', dueDate: '2026-11-12' },
        { dueDate: '2026-11-10', isBlocked: true },
        {},
      ],
      '2026-11-06',
    );
    expect(result.overdue).toBe(0);
    expect(result.summary).toBe('On track - no overdue work');
  });
});
