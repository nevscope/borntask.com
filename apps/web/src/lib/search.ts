export function isTaskKey(q: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(q.trim());
}

export function snippetAround(text: string, q: string, radius = 42): string {
  const hay = text.replace(/\s+/g, ' ').trim();
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

export function highlightParts(text: string, q: string): { pre: string; hit: string; post: string } {
  if (!q.trim()) return { pre: text, hit: '', post: '' };
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return { pre: text, hit: '', post: '' };
  return { pre: text.slice(0, i), hit: text.slice(i, i + q.length), post: text.slice(i + q.length) };
}
