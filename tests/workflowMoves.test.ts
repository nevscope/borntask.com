import { describe, expect, test } from 'vitest';
import {
  bypassApproveWarning,
  duplicateMoveIndexes,
  isDuplicateMove,
  movesThatBypassApprove,
  unusedMove,
} from '@borntask/shared';
import { workspacePackById } from '@borntask/shared';

const stages = [
  { id: 'idea', name: 'Idea', category: 'backlog', side: false },
  { id: 'approved', name: 'Approved', category: 'backlog', side: false },
  { id: 'wip', name: 'WIP', category: 'active', side: false },
  { id: 'ready_for_testing', name: 'Ready for testing', category: 'review', side: false },
  { id: 'on_hold', name: 'On hold', category: 'backlog', side: true },
  { id: 'rejected', name: 'Rejected', category: 'done', side: true },
];

describe('workflow editor moves', () => {
  test('does not add the same from-to pair twice', () => {
    const rows = [
      { from: 'idea', to: 'approved', label: 'Approve' },
      { from: 'idea', to: 'ready_for_testing' },
    ];
    expect(isDuplicateMove(rows, 'idea', 'ready_for_testing')).toBe(true);
    expect(isDuplicateMove(rows, 'wip', 'ready_for_testing')).toBe(false);
    expect(duplicateMoveIndexes([...rows, { from: 'idea', to: 'ready_for_testing' }])).toEqual([2]);
    expect(unusedMove(stages, [
      ...fullPairs(stages),
      { from: '*', to: 'idea' },
    ])).toBeNull();
  });

  test('warns when a move skips Approve', () => {
    const rows = [
      { from: 'idea', to: 'approved', label: 'Approve' },
      { from: 'idea', to: 'rejected', label: 'Reject' },
      { from: 'idea', to: 'on_hold' },
      { from: 'idea', to: 'ready_for_testing' },
      { from: 'wip', to: 'ready_for_testing' },
    ];
    expect(movesThatBypassApprove(rows, stages)).toEqual([
      { from: 'idea', to: 'ready_for_testing' },
    ]);
    expect(bypassApproveWarning(rows, stages)).toMatch(/skips Approve: Idea to Ready for testing/);
    expect(bypassApproveWarning(rows.filter((row) => row.to !== 'ready_for_testing' || row.from !== 'idea'), stages)).toBeNull();
  });

  test('Delivery template has no Any member move into Ready for testing', () => {
    const delivery = workspacePackById('software').workflows.find((workflow) => workflow.slug === 'delivery');
    expect(delivery).toBeTruthy();
    const openIntoReady = delivery!.moves.filter(
      (move) => move.to === 'ready_for_testing' && move.roles.length === 0,
    );
    expect(openIntoReady).toEqual([]);
    const intoReady = delivery!.moves.filter((move) => move.to === 'ready_for_testing');
    expect(intoReady).toEqual([
      { from: 'wip', to: 'ready_for_testing', roles: ['developer', 'lead'] },
    ]);
  });
});

function fullPairs(list: { id: string }[]) {
  const rows: { from: string; to: string }[] = [];
  for (const from of list) {
    for (const to of list) {
      if (from.id !== to.id) rows.push({ from: from.id, to: to.id });
    }
  }
  return rows;
}
