// BornTask colour palettes, light and dark. Same keys in both, so any component that reads
// `palette(mode)` (or the CSS variables in theme.css) switches theme with no other change.
// Dark values are contrast-checked: body text ≥ 4.5:1, tags and pills ≥ 4.5:1, dots and icons ≥ 3:1.
import type { BuiltinProjectRole, BuiltinTaskType, Priority, StatusTone } from '../api/types';

export type ThemeMode = 'light' | 'dark';
export type Appearance = 'system' | ThemeMode;

interface Palette {
  color: {
    brand: string;
    brandFill: string;
    brandText: string;
    brandTint: string;
    brandBorder: string;
    brandOn: string;
    brandOnMuted: string;
    ink: string; ink2: string; ink3: string; muted: string; faint: string;
    border: string; borderStrong: string; dashed: string; divider: string;
    canvas: string; surface: string; subtle: string; chip: string; raised: string;
    danger: string; dangerTint: string;
    warning: string; warningTint: string; warningBorder: string;
    info: string; infoTint: string; infoBorder: string;
    highlight: string;
    unreadRow: string; unreadRowHover: string; unreadDot: string;
    mergedTint: string; merged: string;
    overlay: string; shadow: string;
  };
  typeStyle: Record<BuiltinTaskType, { bg: string; fg: string }>;
  toneStyle: Record<StatusTone, { bg: string; fg: string; dot: string }>;
  priority: Record<Priority, string>;
  role: Record<BuiltinProjectRole, { bg: string; fg: string }>;
  avatarTones: readonly { bg: string; fg: string }[];
  meAvatar: { bg: string; fg: string };
}

export const light: Palette = {
  color: {
    brand: '#178A5C', brandFill: '#15845A', brandText: '#0F6B46', brandTint: '#E9F5EF', brandBorder: '#CFE7DA',
    brandOn: '#E4F3EB', brandOnMuted: '#D2EBDD',
    ink: '#121417', ink2: '#262A24', ink3: '#3A3F38', muted: '#5B6157', faint: '#8A9086',
    border: '#E8EBE6', borderStrong: '#CDD2C9', dashed: '#CDD2C9', divider: '#EEF0EC',
    canvas: '#F7F8F6', surface: '#FFFFFF', subtle: '#FAFBF9', chip: '#F1F2EF', raised: '#FFFFFF',
    danger: '#B42323', dangerTint: '#FDECEC',
    warning: '#8A5A0B', warningTint: '#FFFBF2', warningBorder: '#F1D6A6',
    info: '#1A3F82', infoTint: '#EAF1FD', infoBorder: '#C9DAF7',
    highlight: '#FFE7A3',
    unreadRow: '#F3FAF6', unreadRowHover: '#EAF5EF', unreadDot: '#E0731F',
    mergedTint: '#EEE8FB', merged: '#5B3FC4',
    overlay: 'rgba(18, 20, 23, 0.45)', shadow: '0 18px 40px -16px rgba(18,20,23,.28)',
  },
  typeStyle: {
    idea: { bg: '#F1EEFC', fg: '#5B3FC4' },
    bug: { bg: '#FDECEC', fg: '#B42323' },
    improvement: { bg: '#FDF3E2', fg: '#8A5A0B' },
    feature: { bg: '#EAF1FD', fg: '#1F55B8' },
  },
  toneStyle: {
    neutral: { bg: '#F1F2EF', fg: '#3A3F38', dot: '#8A9086' },
    indigo: { bg: '#EEF0FB', fg: '#3B49B8', dot: '#5865D6' },
    blue: { bg: '#EAF1FD', fg: '#1F55B8', dot: '#2F6FDB' },
    amber: { bg: '#FDF3E2', fg: '#8A5A0B', dot: '#C98A1A' },
    orange: { bg: '#FFF0E5', fg: '#A04A0C', dot: '#E0731F' },
    green: { bg: '#E9F5EF', fg: '#0F6B46', dot: '#178A5C' },
    slate: { bg: '#F1F2EF', fg: '#5B6157', dot: '#5B6157' },
  },
  priority: { urgent: '#B42323', high: '#E0731F', medium: '#C98A1A', low: '#AEB4AA', none: '#E8EBE6' },
  role: {
    lead: { bg: '#121417', fg: '#FFFFFF' },
    business: { bg: '#EEF0FB', fg: '#3B49B8' },
    developer: { bg: '#EAF1FD', fg: '#1F55B8' },
    tester: { bg: '#FDF3E2', fg: '#8A5A0B' },
    observer: { bg: '#F1F2EF', fg: '#3A3F38' },
  },
  avatarTones: [
    { bg: '#D8EAF8', fg: '#1F55B8' },
    { bg: '#F7E3D7', fg: '#A04A0C' },
    { bg: '#EDE4FA', fg: '#5B3FC4' },
    { bg: '#E1F1E8', fg: '#0F6B46' },
    { bg: '#FFF0E5', fg: '#A04A0C' },
    { bg: '#FDF3E2', fg: '#8A5A0B' },
  ],
  meAvatar: { bg: '#121417', fg: '#FFFFFF' },
};

// Dark: warm green-grey neutrals (same hue family as the light greys), never pure black.
// Surfaces get lighter as they rise: canvas < surface < raised (popovers, drawers, modals).
export const dark: Palette = {
  color: {
    brand: '#2FB57A', brandFill: '#15845A', brandText: '#4CC48F', brandTint: '#122A1E', brandBorder: '#1F4A34',
    brandOn: '#163226', brandOnMuted: '#1A3A2C',
    ink: '#E8EBE5', ink2: '#D3D7CF', ink3: '#B8BEB3', muted: '#8F968B', faint: '#6E756A',
    border: '#2C312D', borderStrong: '#3A403B', dashed: '#3A403B', divider: '#232724',
    canvas: '#0E100F', surface: '#161917', subtle: '#1B1F1C', chip: '#252926', raised: '#1E221F',
    danger: '#F27C7C', dangerTint: '#381C1C',
    warning: '#E8B75F', warningTint: '#2B2213', warningBorder: '#5A4318',
    info: '#8FB5F6', infoTint: '#182846', infoBorder: '#2A3F68',
    highlight: '#5A4318',
    unreadRow: '#122319', unreadRowHover: '#16291E', unreadDot: '#EE8A3E',
    mergedTint: '#28233F', merged: '#BBAAF7',
    overlay: 'rgba(0, 0, 0, 0.6)', shadow: '0 18px 40px -12px rgba(0,0,0,.6)',
  },
  typeStyle: {
    idea: { bg: '#28233F', fg: '#BBAAF7' },
    bug: { bg: '#381C1C', fg: '#F28B8B' },
    improvement: { bg: '#33270F', fg: '#E8B75F' },
    feature: { bg: '#182846', fg: '#8FB5F6' },
  },
  toneStyle: {
    neutral: { bg: '#252926', fg: '#C3C8BF', dot: '#8F968B' },
    indigo: { bg: '#222642', fg: '#AAB2F6', dot: '#7F8AEE' },
    blue: { bg: '#182846', fg: '#8FB5F6', dot: '#5B93F0' },
    amber: { bg: '#33270F', fg: '#E8B75F', dot: '#D9A43C' },
    orange: { bg: '#38231A', fg: '#F3A56E', dot: '#EE8A3E' },
    green: { bg: '#11301F', fg: '#6FD4A4', dot: '#2FB57A' },
    slate: { bg: '#252926', fg: '#9DA399', dot: '#8F968B' },
  },
  priority: { urgent: '#F27C7C', high: '#EE8A3E', medium: '#D9A43C', low: '#6E756A', none: '#2C312D' },
  role: {
    lead: { bg: '#E8EBE5', fg: '#121417' },
    business: { bg: '#222642', fg: '#AAB2F6' },
    developer: { bg: '#182846', fg: '#8FB5F6' },
    tester: { bg: '#33270F', fg: '#E8B75F' },
    observer: { bg: '#252926', fg: '#C3C8BF' },
  },
  avatarTones: [
    { bg: '#1C2E47', fg: '#9CC2F7' },
    { bg: '#3A2619', fg: '#F3A56E' },
    { bg: '#2B2442', fg: '#C3B2F8' },
    { bg: '#163223', fg: '#73D3A6' },
    { bg: '#38231A', fg: '#F3A56E' },
    { bg: '#33270F', fg: '#E8B75F' },
  ],
  meAvatar: { bg: '#E8EBE5', fg: '#121417' },
};

export const palette = (mode: ThemeMode): Palette => (mode === 'dark' ? dark : light);
