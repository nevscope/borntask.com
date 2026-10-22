/** Project keys are always three letters, unique within a workspace. */

export function lettersFromName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, '');
}

export function normaliseProjectKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

export function suggestProjectKey(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((key) => key.toUpperCase()));
  const letters = lettersFromName(name);
  const candidates: string[] = [];
  if (letters.length >= 3) {
    candidates.push(letters.slice(0, 3));
    const mid = letters[Math.floor(letters.length / 2)];
    const last = letters[letters.length - 1];
    if (letters[0] && mid && last) candidates.push(`${letters[0]}${mid}${last}`);
    const consonants = letters.replace(/[AEIOU]/g, '');
    if (consonants.length >= 3) candidates.push(consonants.slice(0, 3));
    for (let i = 1; i <= letters.length - 3; i++) candidates.push(letters.slice(i, i + 3));
  } else {
    candidates.push((letters + 'XXX').slice(0, 3));
  }
  for (const candidate of candidates) {
    if (candidate.length === 3 && !used.has(candidate)) return candidate;
  }
  const base = (candidates[0] ?? 'PRJ').padEnd(3, 'X').slice(0, 3);
  for (let i = 0; i < 26; i++) {
    const next = base.slice(0, 2) + String.fromCharCode(65 + i);
    if (!used.has(next)) return next;
  }
  for (let i = 0; i < 26; i++) {
    const next = base[0] + String.fromCharCode(65 + i) + (base[2] ?? 'X');
    if (!used.has(next)) return next;
  }
  for (let i = 0; i < 26 * 26 * 26; i++) {
    const a = String.fromCharCode(65 + Math.floor(i / 676) % 26);
    const b = String.fromCharCode(65 + Math.floor(i / 26) % 26);
    const c = String.fromCharCode(65 + (i % 26));
    const next = `${a}${b}${c}`;
    if (!used.has(next)) return next;
  }
  return 'XXX';
}
