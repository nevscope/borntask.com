function nameParts(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

function lettersOf(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '');
}

/** Candidate two-letter marks: first+last, second letter of first, last name, then leftovers. */
export function personInitialCandidates(name: string): string[] {
  const parts = nameParts(name);
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] ?? '' : '';
  const mid = parts.length > 2 ? parts[1] ?? '' : '';
  const letters = lettersOf(parts.join(''));
  const out: string[] = [];
  const push = (raw: string) => {
    const value = raw.toUpperCase();
    if (value.length >= 1 && !out.includes(value)) out.push(value);
  };

  if (parts.length >= 2) push(`${first[0] ?? ''}${last[0] ?? ''}`);
  if (first.length >= 2) push(first.slice(0, 2));
  if (mid && last) push(`${mid[0] ?? ''}${last[0] ?? ''}`);
  if (first && last.length >= 2) push(`${first[0] ?? ''}${last[1] ?? ''}`);
  if (last.length >= 2) push(last.slice(0, 2));
  if (parts.length === 1 && first.length >= 2) push(first.slice(0, 2));
  if (first) push(first[0] ?? '?');
  for (let i = 1; i < letters.length; i++) {
    push(`${letters[0] ?? '?'}${letters[i] ?? ''}`);
  }
  return out;
}

export function personInitials(name: string, taken: Iterable<string> = []): string {
  const used = new Set([...taken].map((value) => value.toUpperCase()));
  const candidates = personInitialCandidates(name);
  for (const candidate of candidates) {
    if (candidate.length >= 2 && !used.has(candidate)) return candidate;
  }
  for (const candidate of candidates) {
    if (!used.has(candidate)) return candidate;
  }
  const base = (nameParts(name)[0]?.[0] ?? '?').toUpperCase();
  const rest = lettersOf(name).slice(1).toUpperCase();
  for (let n = 1; n <= rest.length; n++) {
    const candidate = `${base}${rest.slice(0, n)}`;
    if (!used.has(candidate)) return candidate;
  }
  let n = 2;
  while (used.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export function assignUniqueInitials(names: string[]): string[] {
  const taken: string[] = [];
  return names.map((name) => {
    const next = personInitials(name, taken);
    taken.push(next);
    return next;
  });
}
