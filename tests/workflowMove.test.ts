import { describe, expect, it } from 'vitest';
import type { Workflow } from '../apps/web/src/api/types';
import { checkMove, completeTarget, moveOptions, rolesForBlockedMove } from '../apps/web/src/lib/workflow';

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

const delivery: Workflow = {
  id: 'wf_delivery_full',
  name: 'Delivery',
  statuses: [
    { id: 'idea', name: 'Idea', category: 'backlog', tone: 'neutral', position: 1, wipLimit: null, side: false },
    { id: 'approved', name: 'Approved', category: 'backlog', tone: 'indigo', position: 2, wipLimit: null, side: false },
    { id: 'wip', name: 'WIP', category: 'active', tone: 'blue', position: 3, wipLimit: 3, side: false },
    { id: 'ready_for_testing', name: 'Ready for testing', category: 'review', tone: 'amber', position: 4, wipLimit: null, side: false },
    { id: 'testing', name: 'Testing', category: 'review', tone: 'orange', position: 5, wipLimit: 2, side: false },
    { id: 'deployed', name: 'Deployed', category: 'done', tone: 'green', position: 6, wipLimit: null, side: false },
    { id: 'on_hold', name: 'On hold', category: 'backlog', tone: 'neutral', position: 7, wipLimit: null, side: true },
  ],
  transitions: [
    { from: 'idea', to: 'approved', roles: ['business'], requireComment: false, label: 'Approve' },
    { from: 'approved', to: 'wip', roles: ['developer'], requireComment: false, label: 'Start work' },
    { from: 'wip', to: 'ready_for_testing', roles: ['developer'], requireComment: false, label: 'Ready' },
    { from: 'ready_for_testing', to: 'testing', roles: ['tester'], requireComment: false, label: 'Start testing' },
    { from: 'testing', to: 'deployed', roles: ['tester'], requireComment: false, label: 'Pass' },
    { from: 'testing', to: 'wip', roles: ['tester'], requireComment: true, label: 'Fail' },
    { from: '*', to: 'on_hold', roles: [], requireComment: false, label: 'Put on hold' },
  ],
};

describe('list Completed on Delivery', () => {
  it('hides Completed when Testing is on the path and Deployed is not allowed', () => {
    expect(completeTarget(delivery, { statusId: 'ready_for_testing', previousStatusId: null }, ['admin'])).toBeNull();
    expect(completeTarget(delivery, { statusId: 'wip', previousStatusId: null }, ['developer'])).toBeNull();
  });

  it('sends Completed to Deployed only when Pass is a legal move', () => {
    const target = completeTarget(delivery, { statusId: 'testing', previousStatusId: null }, ['tester']);
    expect(target?.id).toBe('deployed');
  });
});
