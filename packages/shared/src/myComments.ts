export type MyCommentKind = 'replies' | 'assignedComments' | 'mentions' | 'posts';

export type MyCommentSeed = {
  id: string;
  authorId: string;
  parentId?: string | null;
  body: string;
  taskAssigneeId: string | null;
};

/** Split comments into My tasks conversation buckets. A row can appear in more than one. */
export function partitionMyComments(rows: MyCommentSeed[], meId: string, myName: string) {
  const myIds = new Set(rows.filter((row) => row.authorId === meId).map((row) => row.id));
  const needle = `@${myName}`.toLowerCase();
  const replies: string[] = [];
  const assignedComments: string[] = [];
  const mentions: string[] = [];
  const posts: string[] = [];
  for (const row of rows) {
    if (row.authorId === meId) posts.push(row.id);
    if (row.parentId && myIds.has(row.parentId) && row.authorId !== meId) replies.push(row.id);
    if (row.taskAssigneeId === meId && row.authorId !== meId) assignedComments.push(row.id);
    if (row.authorId !== meId && row.body.toLowerCase().includes(needle)) mentions.push(row.id);
  }
  return { replies, assignedComments, mentions, posts };
}
