import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { color, font } from '../theme/tokens';

export type StatusToastKind = 'success' | 'plain' | 'error';

export type StatusToastPayload = {
  text: ReactNode;
  kind?: StatusToastKind;
  onUndo?: () => void;
  showShortcut?: boolean;
  durationMs?: number;
  actions?: { label: string; onClick: () => void }[];
};

type Host = {
  show: (next: StatusToastPayload | string) => void;
  dismiss: () => void;
};

const ToastContext = createContext<Host | null>(null);

function normalise(next: StatusToastPayload | string): StatusToastPayload {
  return typeof next === 'string' ? { text: next, kind: 'success' } : next;
}

export function StatusToastHost({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<StatusToastPayload | null>(null);
  const timer = useRef<number | null>(null);
  const undoRef = useRef<(() => void) | undefined>(undefined);

  const dismiss = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setPayload(null);
  }, []);

  const show = useCallback((next: StatusToastPayload | string) => {
    const payload = normalise(next);
    undoRef.current = payload.onUndo;
    setPayload(payload);
    if (timer.current) window.clearTimeout(timer.current);
    const ms = payload.durationMs ?? (payload.onUndo ? 8000 : 6000);
    timer.current = window.setTimeout(() => setPayload(null), ms);
  }, []);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!payload?.onUndo) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      const undo = undoRef.current;
      dismiss();
      undo?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload, dismiss]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
        {payload ? <StatusToastView payload={payload} onDismiss={dismiss} /> : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useStatusToast(): { show: (next: StatusToastPayload | string) => void; toast: ReactNode } {
  const host = useContext(ToastContext);
  if (!host) throw new Error('StatusToastHost is required');
  return { show: host.show, toast: null };
}

export function StatusToast({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return <StatusToastView payload={{ text, kind: 'success' }} onDismiss={onDismiss} />;
}

function StatusToastView({ payload, onDismiss }: { payload: StatusToastPayload; onDismiss: () => void }) {
  const kind = payload.kind ?? (payload.onUndo ? 'plain' : 'success');
  const duration = payload.durationMs ?? (payload.onUndo ? 8000 : 6000);
  const showBar = Boolean(payload.onUndo && payload.showShortcut);

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 72,
        right: 24,
        zIndex: 2100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        maxWidth: payload.onUndo ? 520 : 420,
        background: color.ink,
        color: color.surface,
        borderRadius: 10,
        fontSize: 13.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: payload.onUndo ? 12 : 10, padding: '12px 14px' }}>
        {kind === 'success' && (
          <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', background: color.brand, flex: 'none' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color.surface} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </span>
        )}
        {kind === 'error' && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color.unreadDot, flex: 'none' }} />
        )}
        <span style={{ flex: 1 }}>{payload.text}</span>
        {payload.actions?.map((action) => (
          <button key={action.label} type="button" onClick={() => { action.onClick(); onDismiss(); }} style={undoBtn}>{action.label}</button>
        ))}
        {payload.onUndo && (
          <button type="button" onClick={() => { const undo = payload.onUndo; onDismiss(); undo?.(); }} style={undoBtn}>Undo</button>
        )}
        {payload.showShortcut && <kbd style={{ fontFamily: font.ui, fontSize: 11, color: color.faint }}>Ctrl Z</kbd>}
        {!payload.onUndo && !payload.actions?.length && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss} style={{ border: 0, background: 'transparent', color: color.surface, cursor: 'pointer', font: 'inherit', fontSize: 16, lineHeight: 1 }}>×</button>
        )}
      </div>
      {showBar && (
        <div style={{ height: 3, background: color.ink3 }}>
          <div style={{ height: 3, background: color.brand, animation: `bt-toast-bar ${duration}ms linear forwards` }} />
        </div>
      )}
    </div>
  );
}

const undoBtn = {
  height: 30,
  padding: '0 12px',
  border: 0,
  borderRadius: 7,
  background: color.surface,
  color: color.ink,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

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
