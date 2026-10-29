import { expect, test } from 'vitest';
import { groupCommentReactions, isCommentReactionKind } from '@borntask/shared';

test('groupCommentReactions keeps the fixed order and drops unknown kinds', () => {
  expect(isCommentReactionKind('like')).toBe(true);
  expect(isCommentReactionKind('ok')).toBe(false);
  expect(
    groupCommentReactions([
      { emoji: 'seen', userId: 'u2' },
      { emoji: 'like', userId: 'u1' },
      { emoji: 'like', userId: 'u2' },
      { emoji: 'wave', userId: 'u3' },
    ]),
  ).toEqual([
    { emoji: 'like', userIds: ['u1', 'u2'] },
    { emoji: 'seen', userIds: ['u2'] },
  ]);
});
