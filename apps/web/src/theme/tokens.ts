// Runtime colours come from CSS variables in theme.css so light/dark switch without
// rewriting every screen. Hex palettes live in palettes.ts for AntD and mixing.
import type { BuiltinProjectRole, BuiltinTaskType, Priority, StatusTone } from '../api/types';
import { dark, light, palette, type ThemeMode } from './palettes';

export type { Appearance, ThemeMode } from './palettes';
export { dark, light, palette };

export const color = {
  brand: 'var(--bt-brand)',
  brandStrong: 'var(--bt-brand-text)',
  brandFill: 'var(--bt-brand-fill)',
  brandTint: 'var(--bt-brand-tint)',
  brandBorder: 'var(--bt-brand-border)',
  brandOn: 'var(--bt-brand-on)',
  brandOnMuted: 'var(--bt-brand-on-muted)',
  ink: 'var(--bt-ink)',
  ink2: 'var(--bt-ink2)',
  ink3: 'var(--bt-ink3)',
  muted: 'var(--bt-muted)',
  faint: 'var(--bt-faint)',
  border: 'var(--bt-border)',
  dashed: 'var(--bt-dashed)',
  divider: 'var(--bt-divider)',
  canvas: 'var(--bt-canvas)',
  surface: 'var(--bt-surface)',
  subtle: 'var(--bt-subtle)',
  chip: 'var(--bt-chip)',
  raised: 'var(--bt-raised)',
  danger: 'var(--bt-danger)',
  dangerTint: 'var(--bt-danger-tint)',
  inverse: 'var(--bt-inverse)',
  inverseFg: 'var(--bt-inverse-fg)',
  inverseMuted: 'var(--bt-inverse-muted)',
  inverseControl: 'var(--bt-inverse-control)',
  inverseDanger: 'var(--bt-inverse-danger)',
  warning: 'var(--bt-warning)',
  warningTint: 'var(--bt-warning-tint)',
  warningBorder: 'var(--bt-warning-border)',
  info: 'var(--bt-info)',
  infoTint: 'var(--bt-info-tint)',
  infoBorder: 'var(--bt-info-border)',
  highlight: 'var(--bt-highlight)',
  unreadRow: 'var(--bt-unread-row)',
  unreadDot: 'var(--bt-unread-dot)',
  mergedTint: 'var(--bt-merged-tint)',
  merged: 'var(--bt-merged)',
  overlay: 'var(--bt-overlay)',
  shadow: 'var(--bt-shadow)',
} as const;

export const githubBadgeStyle = {
  pr_running: { bg: 'var(--bt-gh-pr-running-bg)', fg: 'var(--bt-gh-pr-running-fg)', label: 'PR · checks running' },
  pr_passed: { bg: 'var(--bt-gh-pr-passed-bg)', fg: 'var(--bt-gh-pr-passed-fg)', label: 'PR · checks passed' },
  pr_failed: { bg: 'var(--bt-gh-pr-failed-bg)', fg: 'var(--bt-gh-pr-failed-fg)', label: 'PR · checks failed' },
  merged: { bg: 'var(--bt-gh-merged-bg)', fg: 'var(--bt-gh-merged-fg)', label: 'Merged' },
  branch: { bg: 'var(--bt-gh-branch-bg)', fg: 'var(--bt-gh-branch-fg)', label: 'Branch only' },
} as const;

export const font = {
  ui: "'DM Sans', system-ui, sans-serif",
  display: "'Sora', 'DM Sans', system-ui, sans-serif",
  mono: "ui-monospace, Menlo, monospace",
} as const;

export const radius = { sm: 6, md: 8, lg: 12, xl: 14 } as const;

export const categoryBar = {
  backlog: 'var(--bt-cat-backlog)',
  active: 'var(--bt-cat-active)',
  review: 'var(--bt-cat-review)',
  done: 'var(--bt-cat-done)',
} as const;

export const projectSwatches = [
  { id: 'blue', label: 'Blue', hex: '#2F6FDB', tint: '#EAF1FD', ink: '#1F55B8', darkTint: '#182846', darkInk: '#8FB5F6' },
  { id: 'green', label: 'Green', hex: '#178A5C', tint: '#E9F5EF', ink: '#0F6B46', darkTint: '#11301F', darkInk: '#6FD4A4' },
  { id: 'orange', label: 'Orange', hex: '#E0731F', tint: '#FFF0E5', ink: '#A04A0C', darkTint: '#38231A', darkInk: '#F3A56E' },
  { id: 'violet', label: 'Violet', hex: '#8E59D9', tint: '#EDE4FA', ink: '#5B3FC4', darkTint: '#28233F', darkInk: '#BBAAF7' },
  { id: 'amber', label: 'Amber', hex: '#C98A1A', tint: '#FDF3E2', ink: '#8A5A0B', darkTint: '#33270F', darkInk: '#E8B75F' },
  { id: 'graphite', label: 'Graphite', hex: '#3A3F38', tint: '#F1F2EF', ink: '#3A3F38', darkTint: '#252926', darkInk: '#C3C8BF' },
] as const;

export const chipSwatches = [
  { id: 'red', label: 'Red', hex: '#B42323', bg: '#FDECEC', fg: '#B42323', darkBg: '#381C1C', darkFg: '#F28B8B' },
  { id: 'orange', label: 'Orange', hex: '#A04A0C', bg: '#FFF0E5', fg: '#A04A0C', also: ['#E0731F'], darkBg: '#38231A', darkFg: '#F3A56E' },
  { id: 'amber', label: 'Amber', hex: '#8A5A0B', bg: '#FDF3E2', fg: '#8A5A0B', also: ['#C98A1A'], darkBg: '#33270F', darkFg: '#E8B75F' },
  { id: 'green', label: 'Green', hex: '#0F6B46', bg: '#E9F5EF', fg: '#0F6B46', also: ['#178A5C'], darkBg: '#11301F', darkFg: '#6FD4A4' },
  { id: 'blue', label: 'Blue', hex: '#1F55B8', bg: '#EAF1FD', fg: '#1F55B8', also: ['#2F6FDB'], darkBg: '#182846', darkFg: '#8FB5F6' },
  { id: 'indigo', label: 'Indigo', hex: '#3B49B8', bg: '#EEF0FB', fg: '#3B49B8', also: ['#5865D6'], darkBg: '#222642', darkFg: '#AAB2F6' },
  { id: 'violet', label: 'Violet', hex: '#5B3FC4', bg: '#F1EEFC', fg: '#5B3FC4', also: ['#8E59D9'], darkBg: '#28233F', darkFg: '#BBAAF7' },
  { id: 'graphite', label: 'Graphite', hex: '#3A3F38', bg: '#F1F2EF', fg: '#3A3F38', also: ['#5B6157', '#8A9086'], darkBg: '#252926', darkFg: '#C3C8BF' },
  { id: 'ink', label: 'Ink', hex: '#121417', bg: '#121417', fg: '#FFFFFF', darkBg: '#E8EBE5', darkFg: '#121417' },
  { id: 'story', label: 'Story', hex: '#0F4C6A', bg: '#E6F1F6', fg: '#0F4C6A', darkBg: '#143040', darkFg: '#8EC4DE' },
  { id: 'epic', label: 'Epic', hex: '#6B3D7A', bg: '#F4ECF6', fg: '#6B3D7A', darkBg: '#2E2238', darkFg: '#D2B4DE' },
] as const;

export const statusSwatches = [
  { id: 'slate', label: 'Slate', hex: '#8A9086' },
  { id: 'indigo', label: 'Indigo', hex: '#5865D6' },
  { id: 'blue', label: 'Blue', hex: '#2F6FDB' },
  { id: 'amber', label: 'Amber', hex: '#C98A1A' },
  { id: 'orange', label: 'Orange', hex: '#E0731F' },
  { id: 'green', label: 'Green', hex: '#178A5C' },
] as const;

export const statusColourByCategory = {
  backlog: '#8A9086',
  active: '#2F6FDB',
  review: '#E0731F',
  done: '#178A5C',
} as const;

export function resolvedThemeMode(): ThemeMode {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return 'dark';
  if (t === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

/** Accepts #RGB or #RRGGBB. Returns uppercase #RRGGBB or null. */
export function parseProjectHex(value: string): string | null {
  const raw = value.trim();
  const m = raw.match(/^#?([0-9A-Fa-f]{6})$/) ?? raw.match(/^#?([0-9A-Fa-f]{3})$/);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

function mixToward(hex: string, target: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const t = parseInt(target.slice(1), 16);
  const mix = (c: number, d: number) => Math.round(c + (d - c) * amount);
  const r = mix((n >> 16) & 255, (t >> 16) & 255);
  const g = mix((n >> 8) & 255, (t >> 8) & 255);
  const b = mix(n & 255, t & 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function projectTint(hex: string) {
  const darkMode = resolvedThemeMode() === 'dark';
  const match = projectSwatches.find((s) => s.hex.toLowerCase() === hex.toLowerCase());
  if (match) {
    return {
      id: match.id,
      label: match.label,
      hex: match.hex,
      tint: darkMode ? match.darkTint : match.tint,
      ink: darkMode ? match.darkInk : match.ink,
    };
  }
  const parsed = parseProjectHex(hex);
  if (!parsed) {
    const p = palette(resolvedThemeMode()).color;
    return { id: 'custom', label: 'Colour', hex, tint: p.chip, ink: p.ink3 };
  }
  const p = palette(resolvedThemeMode()).color;
  return {
    id: 'custom',
    label: 'Custom',
    hex: parsed,
    tint: mixToward(parsed, darkMode ? p.canvas : '#FFFFFF', darkMode ? 0.72 : 0.88),
    ink: parsed,
  };
}

export const typeStyle: Record<BuiltinTaskType, { label: string; bg: string; fg: string }> = {
  idea: { label: 'Idea', bg: 'var(--bt-type-idea-bg)', fg: 'var(--bt-type-idea-fg)' },
  bug: { label: 'Bug', bg: 'var(--bt-type-bug-bg)', fg: 'var(--bt-type-bug-fg)' },
  improvement: { label: 'Improvement', bg: 'var(--bt-type-improvement-bg)', fg: 'var(--bt-type-improvement-fg)' },
  feature: { label: 'Feature', bg: 'var(--bt-type-feature-bg)', fg: 'var(--bt-type-feature-fg)' },
  story: { label: 'Story', bg: 'var(--bt-type-story-bg)', fg: 'var(--bt-type-story-fg)' },
  epic: { label: 'Epic', bg: 'var(--bt-type-epic-bg)', fg: 'var(--bt-type-epic-fg)' },
};

export const toneStyle: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: 'var(--bt-tone-neutral-bg)', fg: 'var(--bt-tone-neutral-fg)', dot: 'var(--bt-tone-neutral-dot)' },
  indigo: { bg: 'var(--bt-tone-indigo-bg)', fg: 'var(--bt-tone-indigo-fg)', dot: 'var(--bt-tone-indigo-dot)' },
  blue: { bg: 'var(--bt-tone-blue-bg)', fg: 'var(--bt-tone-blue-fg)', dot: 'var(--bt-tone-blue-dot)' },
  amber: { bg: 'var(--bt-tone-amber-bg)', fg: 'var(--bt-tone-amber-fg)', dot: 'var(--bt-tone-amber-dot)' },
  orange: { bg: 'var(--bt-tone-orange-bg)', fg: 'var(--bt-tone-orange-fg)', dot: 'var(--bt-tone-orange-dot)' },
  green: { bg: 'var(--bt-tone-green-bg)', fg: 'var(--bt-tone-green-fg)', dot: 'var(--bt-tone-green-dot)' },
  slate: { bg: 'var(--bt-tone-slate-bg)', fg: 'var(--bt-tone-slate-fg)', dot: 'var(--bt-tone-slate-dot)' },
};

export const priorityStyle: Record<Priority, { label: string; color: string; key: string }> = {
  urgent: { label: 'Urgent', color: 'var(--bt-priority-urgent)', key: '1' },
  high: { label: 'High', color: 'var(--bt-priority-high)', key: '2' },
  medium: { label: 'Medium', color: 'var(--bt-priority-medium)', key: '3' },
  low: { label: 'Low', color: 'var(--bt-priority-low)', key: '4' },
  none: { label: 'No priority', color: 'var(--bt-priority-none)', key: '0' },
};

export function chipSwatchFor(hex: string) {
  const key = (parseProjectHex(hex) ?? hex).toLowerCase();
  return chipSwatches.find((s) => s.hex.toLowerCase() === key || ('also' in s && s.also.some((alias) => alias.toLowerCase() === key))) ?? null;
}

export function chipFromHex(hex: string, label: string): { label: string; bg: string; fg: string } {
  const darkMode = resolvedThemeMode() === 'dark';
  const match = chipSwatchFor(hex);
  if (match) return { label, bg: darkMode ? match.darkBg : match.bg, fg: darkMode ? match.darkFg : match.fg };
  const tint = projectTint(hex);
  const parsed = parseProjectHex(hex) ?? (parseProjectHex(tint.hex) ? tint.hex : null);
  if (!parsed) return { label, bg: tint.tint, fg: tint.ink };
  const n = parseInt(parsed.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  if (!darkMode && lum < 0.18) return { label, bg: parsed, fg: light.color.surface };
  if (darkMode && lum > 0.82) return { label, bg: parsed, fg: dark.color.ink };
  return { label, bg: tint.tint, fg: tint.ink };
}

export const roleStyle: Record<BuiltinProjectRole, { label: string; bg: string; fg: string }> = {
  lead: { label: 'Project lead', bg: 'var(--bt-role-lead-bg)', fg: 'var(--bt-role-lead-fg)' },
  business: { label: 'Business', bg: 'var(--bt-role-business-bg)', fg: 'var(--bt-role-business-fg)' },
  developer: { label: 'Developer', bg: 'var(--bt-role-developer-bg)', fg: 'var(--bt-role-developer-fg)' },
  tester: { label: 'Tester', bg: 'var(--bt-role-tester-bg)', fg: 'var(--bt-role-tester-fg)' },
  observer: { label: 'Observer', bg: 'var(--bt-role-observer-bg)', fg: 'var(--bt-role-observer-fg)' },
};

export const avatarTones = [
  { bg: 'var(--bt-avatar-0-bg)', fg: 'var(--bt-avatar-0-fg)' },
  { bg: 'var(--bt-avatar-1-bg)', fg: 'var(--bt-avatar-1-fg)' },
  { bg: 'var(--bt-avatar-2-bg)', fg: 'var(--bt-avatar-2-fg)' },
  { bg: 'var(--bt-avatar-3-bg)', fg: 'var(--bt-avatar-3-fg)' },
  { bg: 'var(--bt-avatar-4-bg)', fg: 'var(--bt-avatar-4-fg)' },
  { bg: 'var(--bt-avatar-5-bg)', fg: 'var(--bt-avatar-5-fg)' },
] as const;

export const meAvatar = { bg: 'var(--bt-me-avatar-bg)', fg: 'var(--bt-me-avatar-fg)' } as const;
