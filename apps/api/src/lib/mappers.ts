// Map DB rows to the web contract. Status ids in the contract are slugs so the
// existing workflow helpers (on_hold, idea, approved) keep working.

type StatusTone = 'neutral' | 'indigo' | 'blue' | 'amber' | 'orange' | 'green' | 'slate';
type StatusCategory = 'backlog' | 'active' | 'review' | 'done';
const TONE_BY_SLUG: Record<string, StatusTone> = {
  idea: 'neutral',
  approved: 'indigo',
  wip: 'blue',
  ready_for_testing: 'amber',
  testing: 'orange',
  deployed: 'green',
  on_hold: 'slate',
  rejected: 'slate',
  todo: 'neutral',
  doing: 'blue',
  done: 'green',
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function mapUser(u: { id: string; name: string; email: string }) {
  return { id: u.id, name: u.name, email: u.email, initials: initialsOf(u.name) };
}

export function statusTone(slug: string): StatusTone {
  return TONE_BY_SLUG[slug] ?? 'neutral';
}

export function isSideStatus(slug: string): boolean {
  return slug === 'on_hold' || slug === 'rejected';
}

export function positionNumber(pos: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(pos.length, 6); i++) n = n * 128 + pos.charCodeAt(i);
  return n;
}

export function nextPosition(after: string | null): string {
  if (!after) return 'a0';
  return `${after}z`;
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
