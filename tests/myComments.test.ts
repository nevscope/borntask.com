import { describe, expect, test } from 'vitest';
import { partitionMyComments } from '../packages/shared/src/myComments.ts';

describe('partitionMyComments', () => {
  const rows = [
    { id: 'mine', authorId: 'me', parentId: null, body: 'I will look at this.', taskAssigneeId: 'me' },
    { id: 'reply', authorId: 'other', parentId: 'mine', body: 'Thanks.', taskAssigneeId: 'me' },
    { id: 'on-mine', authorId: 'other', parentId: null, body: 'Still failing.', taskAssigneeId: 'me' },
    { id: 'ping', authorId: 'other', parentId: null, body: '@Scope please check.', taskAssigneeId: 'them' },
    { id: 'noise', authorId: 'other', parentId: null, body: 'Unrelated.', taskAssigneeId: 'them' },
  ];

  test('fills replies, assigned comments, mentions and my posts', () => {
    const buckets = partitionMyComments(rows, 'me', 'Scope');
    expect(buckets.posts).toEqual(['mine']);
    expect(buckets.replies).toEqual(['reply']);
    expect(buckets.assignedComments).toEqual(['reply', 'on-mine']);
    expect(buckets.mentions).toEqual(['ping']);
  });
});
