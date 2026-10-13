import type { Priority, ProjectRole, TaskType, User, WorkflowStatus } from '../api/types';
import { avatarTones, priorityStyle, roleStyle, toneStyle, typeStyle } from '../theme/tokens';

export function TypeTag({ type, small = false }: { type: TaskType; small?: boolean }) {
  const s = typeStyle[type];
  return (
    <span style={{ fontSize: small ? 11.5 : 12, fontWeight: 500, padding: small ? '1px 7px' : '2px 8px', borderRadius: 6, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

export function StatusPill({ status }: { status: WorkflowStatus | undefined }) {
  if (!status) return null;
  const s = toneStyle[status.tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {status.name}
    </span>
  );
}

export function StatusDot({ status }: { status: WorkflowStatus | undefined }) {
  if (!status) return null;
  return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: toneStyle[status.tone].dot, flex: 'none' }} />;
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  const p = priorityStyle[priority];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#3A3F38' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
      {p.label}
    </span>
  );
}

export function RoleTag({ role }: { role: ProjectRole }) {
  const r = roleStyle[role];
  return <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 8px', borderRadius: 6, background: r.bg, color: r.fg }}>{r.label}</span>;
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

export function Avatar({ user, size = 24 }: { user: User | null | undefined; size?: number }) {
  if (!user) {
    return <span title="Unassigned" style={{ width: size, height: size, borderRadius: '50%', border: '1.5px dashed #AEB4AA', boxSizing: 'border-box', flex: 'none', display: 'inline-block' }} />;
  }
  const tone = user.id === 'u_scope' ? { bg: '#121417', fg: '#FFFFFF' } : avatarTones[hash(user.id) % avatarTones.length]!;
  return (
    <span title={user.name} style={{ width: size, height: size, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', background: tone.bg, color: tone.fg, fontSize: Math.round(size * 0.42), fontWeight: 600, flex: 'none' }}>
      {user.initials}
    </span>
  );
}
