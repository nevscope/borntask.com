import { describe, expect, it } from 'vitest';
import { moveActivityAction, previousStatusIdForMove } from '../apps/api/src/lib/moveTask.ts';

describe('status move activity and previousStatusId', () => {
  it('writes the human status name, not the slug', () => {
    expect(moveActivityAction({
      transitionLabel: null,
      statusName: 'Ready for testing',
    })).toBe('moved to Ready for testing');
    expect(moveActivityAction({
      transitionLabel: 'Start work',
      statusName: 'WIP',
    })).toBe('start work → WIP');
    expect(moveActivityAction({
      undo: true,
      transitionLabel: null,
      statusName: 'Approved',
    })).toBe('undid the move, back to Approved');
    expect(moveActivityAction({
      overrideReason: 'needed today',
      transitionLabel: null,
      statusName: 'Testing',
    })).toBe('overrode to Testing: needed today');
  });

  it('records the status the task left, and clears it when leaving on hold', () => {
    expect(previousStatusIdForMove('approved', 'status_approved_id')).toBe('status_approved_id');
    expect(previousStatusIdForMove('wip', 'status_wip_id')).toBe('status_wip_id');
    expect(previousStatusIdForMove('on_hold', 'status_on_hold_id')).toBeNull();
  });
});
