export const defaultGithubRules = {
  branchCreated: true,
  prOpened: true,
  draftPr: false,
  prMerged: true,
  prClosedUnmerged: true,
} as const;

export type GithubRules = {
  branchCreated: boolean;
  prOpened: boolean;
  draftPr: boolean;
  prClosedUnmerged: boolean;
  prMerged: boolean;
};

export const GITHUB_BLOCKED = new Set(['testing', 'deployed']);

const TASK_KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;

export function extractTaskKeys(...parts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const match of part.matchAll(TASK_KEY_RE)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
}

export function parseGithubRules(value: unknown): GithubRules {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    branchCreated: row.branchCreated !== false,
    prOpened: row.prOpened !== false,
    draftPr: row.draftPr === true,
    prMerged: row.prMerged !== false,
    prClosedUnmerged: row.prClosedUnmerged !== false,
  };
}

export function suggestedBranchName(template: string, type: string, key: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return template.replaceAll('{type}', type).replaceAll('{key}', key).replaceAll('{title}', slug || 'work');
}

export function isForwardGithubMove(
  fromSlug: string,
  toSlug: string,
  statuses: { slug: string; position: number }[],
): boolean {
  if (GITHUB_BLOCKED.has(toSlug)) return false;
  if (toSlug === 'on_hold' || toSlug === 'rejected') return false;
  if (fromSlug === toSlug) return false;
  const from = statuses.find((s) => s.slug === fromSlug);
  const to = statuses.find((s) => s.slug === toSlug);
  if (!from || !to) return false;
  return to.position > from.position;
}

export function atOrPast(
  currentSlug: string,
  targetSlug: string,
  statuses: { slug: string; position: number }[],
): boolean {
  const current = statuses.find((s) => s.slug === currentSlug);
  const target = statuses.find((s) => s.slug === targetSlug);
  if (!current || !target) return true;
  return current.position >= target.position;
}

export type GithubBadge = 'pr_running' | 'pr_passed' | 'pr_failed' | 'merged' | 'branch';

export function githubBadgeFromLinks(
  links: { kind: string; prState: string | null; checks: string | null }[],
): GithubBadge | null {
  if (!links.length) return null;
  const prs = links.filter((l) => l.kind === 'pr');
  if (prs.some((p) => p.prState !== 'merged' && p.checks === 'failed')) return 'pr_failed';
  if (prs.some((p) => p.prState === 'open' && (p.checks === 'running' || p.checks === 'pending'))) return 'pr_running';
  if (prs.some((p) => p.prState === 'open' && p.checks === 'passed')) return 'pr_passed';
  if (prs.some((p) => p.prState === 'merged')) return 'merged';
  if (prs.some((p) => p.prState === 'open')) return 'pr_running';
  if (links.some((l) => l.kind === 'branch')) return 'branch';
  return null;
}
