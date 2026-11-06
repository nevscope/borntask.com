import { stripTags } from './descriptionHtml.js';

export type SearchMatchField = 'title' | 'description' | 'comment' | 'key' | 'subtask' | 'assignee';

export function snippetAround(text: string, q: string, radius = 42): string {
  const hay = stripTags(text).replace(/\s+/g, ' ').trim();
  const i = hay.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return hay.slice(0, radius * 2);
  let start = Math.max(0, i - radius);
  let end = Math.min(hay.length, i + q.length + radius);
  if (start > 0) {
    const space = hay.lastIndexOf(' ', i);
    if (space >= 0 && i - space < radius + 12) start = space + 1;
  }
  if (end < hay.length) {
    const space = hay.indexOf(' ', end);
    if (space >= 0 && space - end < 12) end = space;
  }
  return `${start > 0 ? '…' : ''}${hay.slice(start, end)}${end < hay.length ? '…' : ''}`;
}

export function classifyMatch(
  q: string,
  row: {
    title: string;
    description: string | null;
    assigneeName: string | null;
    comments: { body: string; authorName: string }[];
  },
): { matchField: SearchMatchField; matchSnippet: string; commentAuthor: string | null } {
  const n = q.toLowerCase();
  if (row.title.toLowerCase().includes(n)) return { matchField: 'title', matchSnippet: row.title, commentAuthor: null };
  if (stripTags(row.description ?? '').toLowerCase().includes(n)) {
    return { matchField: 'description', matchSnippet: snippetAround(row.description ?? '', q), commentAuthor: null };
  }
  const c = row.comments.find((x) => x.body.toLowerCase().includes(n));
  if (c) return { matchField: 'comment', matchSnippet: snippetAround(c.body, q), commentAuthor: c.authorName };
  if (row.assigneeName?.toLowerCase().includes(n)) {
    return { matchField: 'assignee', matchSnippet: row.assigneeName, commentAuthor: null };
  }
  return { matchField: 'title', matchSnippet: row.title, commentAuthor: null };
}

export function collapseSearchRows<
  D extends { id: string; deletedAt?: Date | null },
  S extends D & { parentId: string | null; parent: D | null },
>(rows: S[]): { display: D; source: S }[] {
  const byDisplay = new Map<string, { display: D; sources: S[] }>();
  for (const row of rows) {
    if (row.deletedAt) continue;
    const display = row.parentId && row.parent && !row.parent.deletedAt ? row.parent : row.parentId ? null : row;
    if (!display) continue;
    const existing = byDisplay.get(display.id);
    if (existing) existing.sources.push(row);
    else byDisplay.set(display.id, { display, sources: [row] });
  }
  const out: { display: D; source: S }[] = [];
  for (const group of byDisplay.values()) {
    const parentHit = group.sources.find((row) => row.id === group.display.id);
    out.push({ display: group.display, source: parentHit ?? group.sources[0]! });
  }
  return out;
}

export function matchForCollapsed(
  q: string,
  display: { id: string; title: string; description: string | null; assigneeName: string | null; comments: { body: string; authorName: string }[] },
  source: { id: string; title: string; description: string | null; assigneeName: string | null; comments: { body: string; authorName: string }[] },
): { matchField: SearchMatchField; matchSnippet: string; commentAuthor: string | null } {
  if (source.id === display.id) return classifyMatch(q, display);
  const child = classifyMatch(q, source);
  if (child.matchField === 'assignee') return child;
  return {
    matchField: 'subtask',
    matchSnippet: child.matchField === 'title' ? source.title : child.matchSnippet,
    commentAuthor: child.commentAuthor,
  };
}
