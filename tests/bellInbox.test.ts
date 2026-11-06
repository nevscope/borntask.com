import { describe, expect, test } from 'vitest';
import type { Notification } from '../apps/web/src/api/types.ts';
import { collapseBellItems, inTab, matchesFilters, updateSummary } from '../apps/web/src/lib/bellInbox.ts';
import { parseMovedKind, movedKind } from '../apps/api/src/lib/stageNotify.ts';

const actor = { id: 'u1', name: 'Karl', email: 'k@x', initials: 'KF' };

function note(partial: Partial<Notification> & Pick<Notification, 'id' | 'kind'>): Notification {
  return {
    text: partial.text ?? '',
    taskKey: partial.taskKey ?? 'WEB-1',
    projectKey: partial.projectKey ?? 'WEB',
    actor,
    createdAt: partial.createdAt ?? '2026-11-06T10:00:00.000Z',
    readAt: partial.readAt ?? null,
    ...partial,
  };
}

describe('bell tabs and filters', () => {
  test('needs action is assignments, access requests and invites to accept', () => {
    expect(inTab(note({ id: '1', kind: 'assigned' }), 'action')).toBe(true);
    expect(inTab(note({ id: '2', kind: 'access_request' }), 'action')).toBe(true);
    expect(inTab(note({ id: '3', kind: 'invite', needsAccept: true, taskKey: null }), 'action')).toBe(true);
    expect(inTab(note({ id: '4', kind: 'moved' }), 'action')).toBe(false);
    expect(inTab(note({ id: '7', kind: 'access_request', outcome: 'approved', taskKey: null }), 'action')).toBe(false);
    expect(inTab(note({ id: '8', kind: 'access_request', outcome: 'approved', taskKey: null }), 'updates')).toBe(true);
    expect(inTab(note({ id: '5', kind: 'mention' }), 'mentions')).toBe(true);
    expect(inTab(note({ id: '6', kind: 'comment' }), 'updates')).toBe(true);
  });

  test('filters keep reported, assigned, access and project', () => {
    const reported = note({ id: '1', kind: 'moved', reporterId: 'me' });
    expect(matchesFilters(reported, new Set(['reported']), 'me', null)).toBe(true);
    expect(matchesFilters(reported, new Set(['reported']), 'other', null)).toBe(false);
    expect(matchesFilters(note({ id: '2', kind: 'assigned' }), new Set(['assigned']), 'me', null)).toBe(true);
    expect(matchesFilters(note({ id: '3', kind: 'moved' }), new Set(['assigned']), 'me', null)).toBe(false);
    expect(matchesFilters(note({ id: '4', kind: 'access_request', taskKey: null }), new Set(['access']), 'me', null)).toBe(true);
    expect(matchesFilters(note({ id: '5', kind: 'moved', projectKey: 'WEB' }), new Set(), 'me', 'MOB')).toBe(false);
  });
});

describe('stage change collapse', () => {
  test('encodes from and to on the notification kind', () => {
    expect(parseMovedKind(movedKind('Idea', 'Deployed'))).toEqual({ from: 'Idea', to: 'Deployed' });
  });

  test('collapses several changes on one task into from → to with counts', () => {
    const items = collapseBellItems([
      note({ id: 'c', kind: 'comment', taskKey: 'WEB-76', createdAt: '2026-11-06T12:00:00.000Z' }),
      note({
        id: 'm2',
        kind: 'moved',
        taskKey: 'WEB-76',
        fromStatus: 'Ready for testing',
        toStatus: 'Deployed',
        createdAt: '2026-11-06T11:00:00.000Z',
      }),
      note({
        id: 'm1',
        kind: 'moved',
        taskKey: 'WEB-76',
        fromStatus: 'Idea',
        toStatus: 'Ready for testing',
        createdAt: '2026-11-06T10:00:00.000Z',
      }),
      note({ id: 'other', kind: 'assigned', taskKey: 'WEB-1' }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.fromStatus).toBe('Idea');
    expect(items[0]?.toStatus).toBe('Deployed');
    expect(items[0]?.moveCount).toBe(2);
    expect(items[0]?.commentCount).toBe(1);
    expect(updateSummary(items[0]!)).toBe('Idea → Deployed · 2 moves, 1 comment');
  });
});
