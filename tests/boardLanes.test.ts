import { describe, expect, it } from 'vitest';
import { laneDropId, statusFromDropId } from '../apps/web/src/lib/boardLanes.ts';

describe('board swimlane drop ids', () => {
  it('keeps the status slug when a card is dropped in a lane', () => {
    expect(statusFromDropId(laneDropId('none', 'wip'))).toBe('wip');
    expect(statusFromDropId(laneDropId('user_1', 'ready_for_testing'))).toBe('ready_for_testing');
  });

  it('leaves a plain status id unchanged', () => {
    expect(statusFromDropId('approved')).toBe('approved');
  });
});
