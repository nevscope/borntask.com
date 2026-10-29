export const COMMENT_REACTION_KINDS = ['like', 'love', 'yes', 'seen', 'celebrate'] as const;
export type CommentReactionKind = (typeof COMMENT_REACTION_KINDS)[number];

export const COMMENT_REACTION_LABELS: Record<CommentReactionKind, string> = {
  like: 'Like',
  love: 'Love',
  yes: 'Yes',
  seen: 'Seen',
  celebrate: 'Celebrate',
};

export function isCommentReactionKind(value: string): value is CommentReactionKind {
  return (COMMENT_REACTION_KINDS as readonly string[]).includes(value);
}

export function groupCommentReactions(rows: { emoji: string; userId: string }[]) {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!isCommentReactionKind(row.emoji)) continue;
    const list = map.get(row.emoji) ?? [];
    list.push(row.userId);
    map.set(row.emoji, list);
  }
  return COMMENT_REACTION_KINDS
    .filter((kind) => map.has(kind))
    .map((emoji) => ({ emoji, userIds: map.get(emoji)! }));
}
