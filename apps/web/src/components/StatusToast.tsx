import { useEffect, useRef, useState, type ReactNode } from 'react';
import { color } from '../theme/tokens';

export function StatusToast({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div role="status" style={{ position: 'fixed', top: 72, right: 24, zIndex: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', maxWidth: 420, background: color.ink, color: color.surface, borderRadius: 10, fontSize: 13.5 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', background: color.brand, flex: 'none' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color.surface} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
      </span>
      <span style={{ flex: 1 }}>{text}</span>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} style={{ border: 0, background: 'transparent', color: color.surface, cursor: 'pointer', font: 'inherit', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

export function useStatusToast(): { show: (text: string) => void; toast: ReactNode } {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const show = (next: string) => {
    setText(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 6000);
  };
  return {
    show,
    toast: text ? <StatusToast text={text} onDismiss={() => setText(null)} /> : null,
  };
}

export function inviteSentText(invites: { email: string; tenantRole: string }[]): string {
  const one = invites[0];
  if (invites.length === 1 && one) {
    return one.tenantRole === 'guest'
      ? `Invitation sent to ${one.email}. They join as a guest.`
      : `Invitation sent to ${one.email}.`;
  }
  const guests = invites.filter((invite) => invite.tenantRole === 'guest').length;
  if (guests === 0) return `${invites.length} invitations sent.`;
  if (guests === invites.length) return `${invites.length} invitations sent. They join as guests.`;
  return `${invites.length} invitations sent. ${guests} join as guests.`;
}
