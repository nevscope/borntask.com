import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import type { Me } from '../api/types';
import { color } from '../theme/tokens';
import { Avatar } from './Chips';

export function AccountMenu({
  me,
  onClose,
  onShortcuts,
  installAvailable = false,
  onInstall,
  phone = false,
}: {
  me: Me | undefined;
  onClose: () => void;
  onShortcuts: () => void;
  installAvailable?: boolean;
  onInstall?: () => void;
  phone?: boolean;
}) {
  const navigate = useNavigate();
  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div role="menu" aria-label="Account" style={{ minWidth: 260, padding: 6, background: color.surface, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
        <Avatar user={me?.user} size={32} />
        <span>
          <span style={{ display: 'block', fontWeight: 600 }}>{me?.user.name ?? 'Account'}</span>
          <span style={{ fontSize: 12.5, color: color.muted }}>{me?.user.email}</span>
        </span>
      </div>
      {me?.workspaceRole !== 'guest' && me?.workspaceRole !== 'viewer' && (
        <MenuLink phone={phone} onClick={() => go('/timesheets')}>Timesheets</MenuLink>
      )}
      {me?.workspaceRole !== 'guest' && me?.workspaceRole !== 'viewer' && (
        <MenuLink phone={phone} onClick={() => go('/reports')}>Reports</MenuLink>
      )}
      <MenuLink phone={phone} onClick={() => go('/settings/profile')}>Profile and notifications</MenuLink>
      <MenuLink phone={phone} onClick={() => go('/settings/tokens')}>Connected apps and tokens</MenuLink>
      <MenuLink phone={phone} onClick={() => { onClose(); onShortcuts(); }}>
        <span style={{ flex: 1 }}>Keyboard shortcuts</span>
        <kbd className="bt-kbd">?</kbd>
      </MenuLink>
      {installAvailable && onInstall && (
        <MenuLink
          phone={phone}
          onClick={() => {
            onClose();
            onInstall();
          }}
        >
          Install app
        </MenuLink>
      )}
      <div style={{ height: 1, margin: '4px 6px', background: color.divider }} />
      <MenuLink
        phone={phone}
        danger
        onClick={() => {
          void fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).then(() => {
            window.location.href = '/sign-in';
          });
        }}
      >
        Sign out
      </MenuLink>
    </div>
  );
}

export function YouSheet({
  open,
  me,
  onClose,
  onShortcuts,
  installAvailable = false,
  onInstall,
}: {
  open: boolean;
  me: Me | undefined;
  onClose: () => void;
  onShortcuts: () => void;
  installAvailable?: boolean;
  onInstall?: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div
      role="presentation"
      className="bt-phone-sheet"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
        zIndex: 200,
        background: color.surface,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        role="dialog"
        aria-label="You"
        onClick={(event) => event.stopPropagation()}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', background: color.surface }}
      >
        <AccountMenu
          phone
          me={me}
          onClose={onClose}
          onShortcuts={onShortcuts}
          installAvailable={installAvailable}
          onInstall={onInstall}
        />
      </div>
    </div>,
    document.body,
  );
}

function MenuLink({ children, onClick, danger = false, phone = false }: { children: ReactNode; onClick: () => void; danger?: boolean; phone?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: phone ? 44 : 36,
        padding: '0 10px',
        border: 0,
        borderRadius: 8,
        background: 'transparent',
        font: 'inherit',
        fontSize: 13.5,
        textAlign: 'left',
        color: danger ? color.danger : color.ink,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
