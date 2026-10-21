import { BASE_URL } from '../api/http';
import { useWorkspaceCatalog } from '../api/catalog';
import type { BuiltinProjectRole, BuiltinTaskType, Priority, ProjectRole, TaskType, User, WorkflowStatus } from '../api/types';
import { avatarTones, chipFromHex, color, githubBadgeStyle, priorityStyle, projectTint, roleStyle, toneStyle, typeStyle } from '../theme/tokens';

export function TypeTag({ type, small = false }: { type: TaskType; small?: boolean }) {
  const catalog = useWorkspaceCatalog();
  const custom = catalog.types.find((item) => item.slug === type);
  const builtin = type in typeStyle ? typeStyle[type as BuiltinTaskType] : null;
  const s = custom ? chipFromHex(custom.colour, custom.name) : builtin ?? chipFromHex(color.muted, type);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: small ? 20 : 24, fontSize: small ? 11.5 : 12, fontWeight: 500, padding: small ? '0 7px' : '0 8px', borderRadius: 6, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

export function StatusPill({ status }: { status: WorkflowStatus | undefined }) {
  if (!status) return null;
  const s = toneStyle[status.tone];
  const tint = status.colour ? projectTint(status.colour) : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px', borderRadius: 999, background: tint?.tint ?? s.bg, color: tint?.ink ?? s.fg, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tint?.hex ?? s.dot }} />
      {status.name}
    </span>
  );
}

export function StatusDot({ status }: { status: WorkflowStatus | undefined }) {
  if (!status) return null;
  const fill = status.colour ? projectTint(status.colour).hex : toneStyle[status.tone].dot;
  return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: fill, flex: 'none' }} />;
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  const p = priorityStyle[priority];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: color.ink3 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
      {p.label}
    </span>
  );
}

export function RoleTag({ role }: { role: ProjectRole }) {
  const catalog = useWorkspaceCatalog();
  const custom = catalog.roles.find((item) => item.slug === role);
  const builtin = role in roleStyle ? roleStyle[role as BuiltinProjectRole] : null;
  const r = custom ? chipFromHex(custom.colour, custom.name) : builtin ?? chipFromHex(color.muted, role);
  return <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 8px', borderRadius: 6, background: r.bg, color: r.fg }}>{r.label}</span>;
}

export function GitForkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M6 8.5v7M18 15.5V10a3 3 0 0 0-3-3h-4" />
    </svg>
  );
}

export function GitHubBadge({ kind, compact = false }: { kind: keyof typeof githubBadgeStyle | null | undefined; compact?: boolean }) {
  if (!kind) return null;
  const s = githubBadgeStyle[kind];
  const label = compact ? (kind === 'merged' ? 'Merged' : kind === 'branch' ? 'Branch' : 'PR 1') : s.label;
  return (
    <span title={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: compact ? '1px 7px' : '2px 8px', borderRadius: 6, background: s.bg, color: s.fg, fontWeight: 600, fontSize: 12, marginLeft: 'auto' }}>
      <GitForkIcon />
      {label}
    </span>
  );
}

export function EditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
    </svg>
  );
}

export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: '-1px' }}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function WorkspaceMark({
  name,
  id,
  logo,
  size = 20,
  version,
}: {
  name: string;
  id?: string;
  logo?: boolean;
  size?: number;
  version?: number | string;
}) {
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'BT';
  if (logo && id) {
    const src = `${BASE_URL}/workspaces/${id}/logo${version != null ? `?v=${version}` : ''}`;
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: Math.max(4, Math.round(size * 0.22)), objectFit: 'cover', flex: 'none' }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.22)),
        display: 'inline-grid',
        placeItems: 'center',
        background: color.brand,
        color: color.surface,
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        flex: 'none',
      }}
    >
      {initials}
    </span>
  );
}

export function Avatar({ user, size = 24, fontSize }: { user: User | null | undefined; size?: number; fontSize?: number }) {
  if (!user) {
    return <span title="Unassigned" style={{ width: size, height: size, borderRadius: '50%', border: `1.5px dashed ${color.faint}`, boxSizing: 'border-box', flex: 'none', display: 'inline-block' }} />;
  }
  const tone = user.id === 'u_scope' || user.id === 'u_github' ? { bg: 'var(--bt-me-avatar-bg)', fg: 'var(--bt-me-avatar-fg)' } : avatarTones[hash(user.id) % avatarTones.length]!;
  return (
    <span title={user.name} style={{ width: size, height: size, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: tone.bg, color: tone.fg, fontSize: fontSize ?? Math.round(size * 0.42), fontWeight: 600, flex: 'none' }}>
      {user.initials}
    </span>
  );
}
