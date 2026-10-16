// BornTask design tokens, taken from the approved screens (BornTask Screens canvas).
// Every colour in components should come from here or from the AntD theme built on it.
import type { Priority, ProjectRole, StatusTone, TaskType } from '../api/types';

export const color = {
  brand: '#178A5C',
  brandStrong: '#0F6B46',
  brandTint: '#E9F5EF',
  brandBorder: '#CFE7DA',
  brandOn: '#E4F3EB',
  brandOnMuted: '#D2EBDD',
  ink: '#121417',
  ink2: '#262A24',
  ink3: '#3A3F38',
  muted: '#5B6157',
  faint: '#8A9086',
  border: '#E8EBE6',
  dashed: '#CDD2C9',
  divider: '#EEF0EC',
  canvas: '#F7F8F6',
  surface: '#FFFFFF',
  subtle: '#FAFBF9',
  chip: '#F1F2EF',
  danger: '#B42323',
  dangerTint: '#FDECEC',
  warning: '#8A5A0B',
  warningTint: '#FFFBF2',
  warningBorder: '#F1D6A6',
  info: '#1A3F82',
  infoTint: '#EAF1FD',
  infoBorder: '#C9DAF7',
  highlight: '#FFE7A3',
  unreadRow: '#F6FBF8',
  unreadDot: '#E0731F',
  mergedTint: '#EEE8FB',
  merged: '#5B3FC4',
} as const;

export const githubBadgeStyle = {
  pr_running: { bg: '#FDF3E2', fg: '#8A5A0B', label: 'PR · checks running' },
  pr_passed: { bg: '#E9F5EF', fg: '#0F6B46', label: 'PR · checks passed' },
  pr_failed: { bg: '#FDECEC', fg: '#B42323', label: 'PR · checks failed' },
  merged: { bg: '#EEE8FB', fg: '#5B3FC4', label: 'Merged' },
  branch: { bg: '#F1F2EF', fg: '#3A3F38', label: 'Branch only' },
} as const;

export const font = {
  ui: "'DM Sans', system-ui, sans-serif",
  display: "'Sora', 'DM Sans', system-ui, sans-serif",
  mono: "ui-monospace, Menlo, monospace",
} as const;

export const radius = { sm: 6, md: 8, lg: 12, xl: 14 } as const;

/** Stacked project bars: backlog, active, review, done. */
export const categoryBar = {
  backlog: '#AEB4AA',
  active: '#2F6FDB',
  review: '#E0731F',
  done: '#178A5C',
} as const;

/** Project colour picker (Create project mock). */
export const projectSwatches = [
  { id: 'blue', label: 'Blue', hex: '#2F6FDB', tint: '#EAF1FD', ink: '#1F55B8' },
  { id: 'green', label: 'Green', hex: '#178A5C', tint: '#E9F5EF', ink: '#0F6B46' },
  { id: 'orange', label: 'Orange', hex: '#E0731F', tint: '#FFF0E5', ink: '#A04A0C' },
  { id: 'violet', label: 'Violet', hex: '#8E59D9', tint: '#EDE4FA', ink: '#5B3FC4' },
  { id: 'amber', label: 'Amber', hex: '#C98A1A', tint: '#FDF3E2', ink: '#8A5A0B' },
  { id: 'graphite', label: 'Graphite', hex: '#3A3F38', tint: '#F1F2EF', ink: '#3A3F38' },
] as const;

/** Accepts #RGB or #RRGGBB. Returns uppercase #RRGGBB or null. */
export function parseProjectHex(value: string): string | null {
  const raw = value.trim();
  const m = raw.match(/^#?([0-9A-Fa-f]{6})$/) ?? raw.match(/^#?([0-9A-Fa-f]{3})$/);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

function mixTowardWhite(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function projectTint(hex: string) {
  const match = projectSwatches.find((s) => s.hex.toLowerCase() === hex.toLowerCase());
  if (match) return match;
  const parsed = parseProjectHex(hex);
  if (!parsed) return { id: 'custom', label: 'Colour', hex, tint: color.chip, ink: color.ink3 };
  return { id: 'custom', label: 'Custom', hex: parsed, tint: mixTowardWhite(parsed, 0.88), ink: parsed };
}

export const typeStyle: Record<TaskType, { label: string; bg: string; fg: string }> = {
  idea: { label: 'Idea', bg: '#F1EEFC', fg: '#5B3FC4' },
  bug: { label: 'Bug', bg: '#FDECEC', fg: '#B42323' },
  improvement: { label: 'Improvement', bg: '#FDF3E2', fg: '#8A5A0B' },
  feature: { label: 'Feature', bg: '#EAF1FD', fg: '#1F55B8' },
};

export const toneStyle: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: '#F1F2EF', fg: '#3A3F38', dot: '#8A9086' },
  indigo: { bg: '#EEF0FB', fg: '#3B49B8', dot: '#5865D6' },
  blue: { bg: '#EAF1FD', fg: '#1F55B8', dot: '#2F6FDB' },
  amber: { bg: '#FDF3E2', fg: '#8A5A0B', dot: '#C98A1A' },
  orange: { bg: '#FFF0E5', fg: '#A04A0C', dot: '#E0731F' },
  green: { bg: '#E9F5EF', fg: '#0F6B46', dot: '#178A5C' },
  slate: { bg: '#F1F2EF', fg: '#5B6157', dot: '#5B6157' },
};

export const priorityStyle: Record<Priority, { label: string; color: string; key: string }> = {
  urgent: { label: 'Urgent', color: '#B42323', key: '1' },
  high: { label: 'High', color: '#E0731F', key: '2' },
  medium: { label: 'Medium', color: '#C98A1A', key: '3' },
  low: { label: 'Low', color: '#AEB4AA', key: '4' },
  none: { label: 'No priority', color: '#E8EBE6', key: '0' },
};

export const roleStyle: Record<ProjectRole, { label: string; bg: string; fg: string }> = {
  lead: { label: 'Project lead', bg: '#121417', fg: '#FFFFFF' },
  business: { label: 'Business', bg: '#EEF0FB', fg: '#3B49B8' },
  developer: { label: 'Developer', bg: '#EAF1FD', fg: '#1F55B8' },
  tester: { label: 'Tester', bg: '#FDF3E2', fg: '#8A5A0B' },
  observer: { label: 'Observer', bg: '#F1F2EF', fg: '#3A3F38' },
};

// Avatar tones, picked deterministically from the user id.
export const avatarTones = [
  { bg: '#D8EAF8', fg: '#1F55B8' },
  { bg: '#F7E3D7', fg: '#A04A0C' },
  { bg: '#EDE4FA', fg: '#5B3FC4' },
  { bg: '#E1F1E8', fg: '#0F6B46' },
  { bg: '#FFF0E5', fg: '#A04A0C' },
  { bg: '#FDF3E2', fg: '#8A5A0B' },
] as const;
