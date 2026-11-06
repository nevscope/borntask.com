import { describe, expect, test } from 'vitest';
import { formatReleaseDate, isReleaseReleased, summariseReleaseProgress } from '../packages/shared/src/releases.ts';

describe('workspace releases', () => {
  test('progress groups by status and counts done', () => {
    const progress = summariseReleaseProgress([
      { statusId: 'wip', statusName: 'WIP', statusCategory: 'active' },
      { statusId: 'wip', statusName: 'WIP', statusCategory: 'active' },
      { statusId: 'deployed', statusName: 'Deployed', statusCategory: 'done' },
      { statusId: 'idea', statusName: 'Idea', statusCategory: 'backlog' },
    ]);
    expect(progress.total).toBe(4);
    expect(progress.done).toBe(1);
    expect(progress.byStatus.map((row) => row.id)).toEqual(['idea', 'wip', 'deployed']);
    expect(progress.byStatus.find((row) => row.id === 'wip')?.count).toBe(2);
  });

  test('a release is released once its date is today or earlier', () => {
    expect(isReleaseReleased('2026-11-06', '2026-11-06')).toBe(true);
    expect(isReleaseReleased('2026-11-20', '2026-11-06')).toBe(false);
  });

  test('dates format in British English', () => {
    expect(formatReleaseDate('2026-11-12')).toBe('12 Nov 2026');
  });
});
