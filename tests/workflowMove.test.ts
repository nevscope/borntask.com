import { describe, expect, it } from 'vitest';
import type { Workflow } from '../apps/web/src/api/types';
import { checkMove, moveOptions, rolesForBlockedMove } from '../apps/web/src/lib/workflow';

const wf: Workflow = {
  id: 'wf_delivery',
  name: 'Delivery',
  statuses: [
    { id: 'approved', name: 'Approved', category: 'backlog', tone: 'indigo', position: 2, wipLimit: null, side: false },
    { id: 'wip', name: 'WIP', category: 'active', tone: 'blue', position: 3, wipLimit: 3, side: false },
    { id: 'testing', name: 'Testing', category: 'review', tone: 'orange', position: 5, wipLimit: 2, side: false },
    { id: 'on_hold', name: 'On hold', category: 'backlog', tone: 'neutral', position: 7, wipLimit: null, side: true },
  ],
  transitions: [
    { from: 'approved', to: 'wip', roles: ['developer'], requireComment: false, label: 'Start work' },
    { from: 'ready', to: 'testing', roles: ['tester'], requireComment: false, label: 'Start testing' },
    { from: '*', to: 'on_hold', roles: [], requireComment: false, label: 'Put on hold' },
  ],
};

describe('blocked skip-ahead moves', () => {
  it('exposes Testing from Approved with tester roles', () => {
    const task = { statusId: 'approved', previousStatusId: null };
    const check = checkMove(wf, task, 'testing', ['business']);
    expect(check.kind).toBe('not-allowed');
    if (check.kind !== 'not-allowed') return;
    expect(check.transition.roles).toEqual(['tester']);
    expect(moveOptions(wf, task, ['business']).some((row) => row.status.id === 'testing')).toBe(true);
  });

  it('returns incoming roles when there is no listed edge', () => {
    expect(rolesForBlockedMove(wf, 'approved', 'testing')).toEqual(['tester']);
    expect(rolesForBlockedMove(wf, 'approved', 'wip')).toEqual(['developer']);
  });
});
