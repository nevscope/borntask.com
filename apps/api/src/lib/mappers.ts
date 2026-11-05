// Map DB rows to the web contract. Status ids in the contract are slugs so the
// existing workflow helpers (on_hold, idea, approved) keep working.

import { assignUniqueInitials, personInitials } from '@borntask/shared';

type StatusTone = 'neutral' | 'indigo' | 'blue' | 'amber' | 'orange' | 'green' | 'slate';
type StatusCategory = 'backlog' | 'active' | 'review' | 'done';
const TONE_BY_SLUG: Record<string, StatusTone> = {
  idea: 'neutral',
  approved: 'indigo',
  wip: 'blue',
  ready_for_testing: 'amber',
  testing: 'orange',
  deployed: 'green',
  verified: 'green',
  on_hold: 'slate',
  rejected: 'slate',
  todo: 'neutral',
  doing: 'blue',
  done: 'green',
};

export function parseDisabledTypes(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((slug) => slug.trim()).filter(Boolean);
}

export function serializeDisabledTypes(slugs: string[]): string {
  return [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))].join(',');
}

export function typeIsDisabled(raw: string | null | undefined, slug: string): boolean {
  return parseDisabledTypes(raw).includes(slug);
}

export function initialsOf(name: string): string {
  return personInitials(name);
}

export function mapUser(u: { id: string; name: string; email: string }) {
  return { id: u.id, name: u.name, email: u.email, initials: personInitials(u.name) };
}

export function mapUsers(users: { id: string; name: string; email: string }[]) {
  const initials = assignUniqueInitials(users.map((u) => u.name));
  return users.map((u, i) => ({ id: u.id, name: u.name, email: u.email, initials: initials[i] ?? personInitials(u.name) }));
}

export function statusTone(slug: string): StatusTone {
  return TONE_BY_SLUG[slug] ?? 'neutral';
}

export function isSideStatus(slug: string): boolean {
  return slug === 'on_hold' || slug === 'rejected';
}

export function positionNumber(pos: string): number {
  if (/^\d+$/.test(pos)) {
    const n = Number(pos);
    return Number.isSafeInteger(n) ? n : Number(BigInt(pos) % BigInt(Number.MAX_SAFE_INTEGER));
  }
  let n = 0;
  const used = Math.min(pos.length, 7);
  for (let i = 0; i < used; i++) n = n * 128 + pos.charCodeAt(i);
  if (pos.length > 7) n += pos.length;
  return n;
}

/** Lexicographic successor that also changes the API sort key (`positionNumber`). */
function incrementRank(after: string): string {
  const chars = [...after];
  const last = Math.min(chars.length, 7) - 1;
  for (let i = last; i >= 0; i--) {
    const code = chars[i]!.charCodeAt(0);
    if (code < 122) {
      chars[i] = String.fromCharCode(code + 1);
      return chars.slice(0, i + 1).join('');
    }
  }
  return `b${after.slice(0, 6)}`;
}

export function nextPosition(after: string | null): string {
  if (!after) return rankKey(0);
  if (/^\d+$/.test(after)) return String(BigInt(after) + 1n);
  const digits = after.match(/^a(\d+)$/);
  if (digits?.[1]) {
    const next = Number(digits[1]) + 1;
    if (String(next).length <= digits[1].length) {
      return `a${String(next).padStart(digits[1].length, '0')}`;
    }
  }
  return incrementRank(after);
}

/** Zero-padded rank so MySQL string order matches display order (`a0002` before `a0010`). */
export function rankKey(index: number): string {
  return `a${String(index).padStart(4, '0')}`;
}

export function comparePosition(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

export function remapRoleSlug(slug: string): string {
  if (slug === 'lead' || slug === 'business' || slug === 'developer' || slug === 'tester' || slug === 'observer') {
    return slug;
  }
  return slug || 'observer';
}

export function remapTypeSlug(slug: string): string {
  if (slug === 'idea' || slug === 'bug' || slug === 'improvement' || slug === 'feature') return slug;
  return slug || 'idea';
}

const COLOUR_BY_CATEGORY: Record<StatusCategory, string> = {
  backlog: '#8A9086',
  active: '#2F6FDB',
  review: '#E0731F',
  done: '#178A5C',
};

export function colourForCategory(category: StatusCategory): string {
  return COLOUR_BY_CATEGORY[category];
}

export function mapStatus(s: {
  slug: string;
  name: string;
  category: StatusCategory;
  colour?: string | null;
  position: number;
  wipLimit: number | null;
}) {
  return {
    id: s.slug,
    name: s.name,
    category: s.category,
    tone: statusTone(s.slug),
    colour: s.colour?.trim() || colourForCategory(s.category),
    position: s.position,
    wipLimit: s.wipLimit,
    side: isSideStatus(s.slug),
  };
}
