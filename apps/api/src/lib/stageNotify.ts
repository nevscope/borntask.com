export function movedKind(fromName: string, toName: string): string {
  return `moved:${encodeURIComponent(fromName)}:${encodeURIComponent(toName)}`;
}

export function parseMovedKind(kind: string): { from: string; to: string } | null {
  if (!kind.startsWith('moved:')) return null;
  const rest = kind.slice('moved:'.length);
  const split = rest.indexOf(':');
  if (split < 0) return null;
  try {
    const from = decodeURIComponent(rest.slice(0, split));
    const to = decodeURIComponent(rest.slice(split + 1));
    if (!from || !to) return null;
    return { from, to };
  } catch {
    return null;
  }
}
