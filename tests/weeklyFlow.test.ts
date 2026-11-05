import { describe, expect, it } from 'vitest';
import { weeklyCreatedClosed } from '../apps/api/src/lib/weeklyFlow.ts';

describe('created and closed by week', () => {
  it('counts tasks into the Monday of their week and keeps empty weeks', () => {
    const weeks = weeklyCreatedClosed(
      [new Date('2026-11-03T10:00:00Z'), new Date('2026-11-12T10:00:00Z')],
      [new Date('2026-11-06T10:00:00Z')],
      '2026-11-02',
      '2026-11-15',
    );
    expect(weeks.map((week) => week.week)).toEqual(['2026-11-02', '2026-11-09']);
    expect(weeks[0]).toMatchObject({ label: '2 Nov', opened: 1, closed: 1 });
    expect(weeks[1]).toMatchObject({ label: '9 Nov', opened: 1, closed: 0 });
  });

  it('includes the partial week when the range starts mid-week', () => {
    const weeks = weeklyCreatedClosed(
      [new Date('2026-11-05T10:00:00Z')],
      [],
      '2026-11-04',
      '2026-11-05',
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ week: '2026-11-02', opened: 1, closed: 0 });
  });

  it('puts a Sunday in the Monday that started that week', () => {
    const weeks = weeklyCreatedClosed(
      [new Date('2026-11-08T23:00:00Z')],
      [new Date('2026-11-09T00:30:00Z')],
      '2026-11-08',
      '2026-11-09',
    );
    expect(weeks.map((week) => week.week)).toEqual(['2026-11-02', '2026-11-09']);
    expect(weeks[0]).toMatchObject({ opened: 1, closed: 0 });
    expect(weeks[1]).toMatchObject({ opened: 0, closed: 1 });
  });

  it('ignores dates that fall outside the weeks covering the range', () => {
    const weeks = weeklyCreatedClosed(
      [new Date('2026-10-31T12:00:00Z'), new Date('2026-11-03T12:00:00Z')],
      [new Date('2026-11-20T12:00:00Z')],
      '2026-11-02',
      '2026-11-08',
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ week: '2026-11-02', opened: 1, closed: 0 });
  });

  it('crosses the new year without dropping a week', () => {
    const weeks = weeklyCreatedClosed(
      [new Date('2026-12-31T12:00:00Z'), new Date('2027-01-04T12:00:00Z')],
      [],
      '2026-12-28',
      '2027-01-10',
    );
    expect(weeks.map((week) => week.week)).toEqual(['2026-12-28', '2027-01-04']);
    expect(weeks[0]).toMatchObject({ label: '28 Dec', opened: 1 });
    expect(weeks[1]).toMatchObject({ label: '4 Jan', opened: 1 });
  });

  it('returns no weeks when the range is backwards', () => {
    expect(weeklyCreatedClosed([new Date('2026-11-03T12:00:00Z')], [], '2026-11-10', '2026-11-02')).toEqual([]);
  });
});
