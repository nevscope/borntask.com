import { Popover } from 'antd';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAcceptProjectInvite, useMarkNotificationsRead, useNotifications } from '../api/queries';
import type { Notification } from '../api/types';
import { formatWhen } from '../lib/relativeTime';
import { color, radius } from '../theme/tokens';
import { useStatusToast } from './StatusToast';
import { Avatar } from './Chips';

function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function refLabel(n: Notification) {
  return n.taskKey ?? n.projectKey ?? 'BornTask';
}

function NotificationRow({
  note,
  onOpen,
  onAccept,
  accepting,
}: {
  note: Notification;
  onOpen: (note: Notification) => void;
  onAccept: (note: Notification) => void;
  accepting: boolean;
}) {
  const unread = !note.readAt;
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        borderBottom: `1px solid ${color.divider}`,
        background: unread ? color.unreadRow : color.surface,
        color: color.ink,
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(note)}
        style={{
          display: 'flex',
          gap: 12,
          flex: 1,
          minWidth: 0,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <Avatar user={note.actor} size={30} />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13.5, lineHeight: 1.4 }}>
          <span>{note.text}</span>
          <span style={{ fontSize: 12, color: color.muted }}>{refLabel(note)} · {formatWhen(note.createdAt)}</span>
        </span>
      </button>
      {note.needsAccept && note.projectKey && (
        <button
          type="button"
          onClick={() => onAccept(note)}
          disabled={accepting}
          style={{
            alignSelf: 'center',
            height: 32,
            padding: '0 12px',
            border: 0,
            borderRadius: radius.md,
            background: color.brandFill,
            color: color.brandOn,
            font: 'inherit',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: accepting ? 'wait' : 'pointer',
          }}
        >
          {accepting ? 'Joining…' : 'Join project'}
        </button>
      )}
      <span
        aria-hidden="true"
        style={{
          flex: 'none',
          width: 8,
          height: 8,
          marginTop: 6,
          borderRadius: '50%',
          background: unread ? color.brand : 'transparent',
        }}
      />
    </div>
  );
}

export function NotificationPanel({ onClose, phone = false }: { onClose: () => void; phone?: boolean }) {
  const navigate = useNavigate();
  const toast = useStatusToast();
  const list = useNotifications().data;
  const mark = useMarkNotificationsRead();
  const accept = useAcceptProjectInvite();
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const items = list?.items ?? [];
  const unreadCount = list?.unreadCount ?? 0;
  const shown = tab === 'unread' ? items.filter((n) => !n.readAt) : items;

  const go = (note: Notification) => {
    if (note.kind === 'access_request' && note.projectKey) {
      navigate(`/p/${note.projectKey}/settings/members`);
      return;
    }
    if (note.taskKey && note.projectKey) {
      navigate(`/p/${note.projectKey}/list?task=${note.taskKey}`);
      return;
    }
    if (note.projectKey) {
      navigate(`/p/${note.projectKey}/list`);
    }
  };

  const open = (note: Notification) => {
    if (!note.readAt) mark.mutate({ id: note.id });
    onClose();
    if (note.needsAccept && note.projectKey) {
      void accept.mutateAsync(note.projectKey).then(() => go(note)).catch((err: unknown) => {
        toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not join this project.' });
      });
      return;
    }
    go(note);
  };

  const join = (note: Notification) => {
    if (!note.projectKey) return;
    void accept.mutateAsync(note.projectKey).then(() => {
      if (!note.readAt) mark.mutate({ id: note.id });
      onClose();
      go(note);
    }).catch((err: unknown) => {
      toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not join this project.' });
    });
  };

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      style={{
        width: phone ? '100%' : 420,
        maxWidth: phone ? '100%' : 'calc(100vw - 24px)',
        height: phone ? '100%' : undefined,
        display: phone ? 'flex' : undefined,
        flexDirection: phone ? 'column' : undefined,
        background: color.surface,
        border: phone ? 0 : `1px solid ${color.border}`,
        borderRadius: phone ? 0 : radius.xl,
        boxShadow: phone ? 'none' : color.shadow,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${color.divider}` }}>
        <span style={{ fontWeight: 600 }}>Notifications</span>
        <div role="tablist" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: color.chip }}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'unread'}
            onClick={() => setTab('unread')}
            style={{
              height: 26,
              padding: '0 10px',
              border: 0,
              borderRadius: 6,
              background: tab === 'unread' ? color.surface : 'transparent',
              font: 'inherit',
              fontSize: 12.5,
              fontWeight: tab === 'unread' ? 600 : 400,
              color: tab === 'unread' ? color.ink : color.ink3,
              cursor: 'pointer',
            }}
          >
            Unread {unreadCount}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            onClick={() => setTab('all')}
            style={{
              height: 26,
              padding: '0 10px',
              border: 0,
              borderRadius: 6,
              background: tab === 'all' ? color.surface : 'transparent',
              font: 'inherit',
              fontSize: 12.5,
              fontWeight: tab === 'all' ? 600 : 400,
              color: tab === 'all' ? color.ink : color.ink3,
              cursor: 'pointer',
            }}
          >
            All
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={() => mark.mutate({ all: true })}
          style={{
            height: 30,
            padding: '0 8px',
            border: 0,
            background: 'transparent',
            font: 'inherit',
            fontSize: 12.5,
            color: unreadCount === 0 ? color.faint : color.brandStrong,
            fontWeight: 600,
            cursor: unreadCount === 0 ? 'default' : 'pointer',
          }}
        >
          Mark all read
        </button>
      </div>
      {shown.length === 0 ? (
        <div style={{ padding: '28px 16px', fontSize: 13.5, color: color.muted, textAlign: 'center', flex: phone ? 1 : undefined }}>
          {tab === 'unread' ? 'You are up to date.' : 'No notifications yet.'}
        </div>
      ) : (
        <div style={{ flex: phone ? 1 : undefined, overflow: phone ? 'auto' : undefined }}>
          {shown.map((note) => (
            <NotificationRow
              key={note.id}
              note={note}
              onOpen={open}
              onAccept={join}
              accepting={accept.isPending && accept.variables === note.projectKey}
            />
          ))}
        </div>
      )}
      <div style={{ padding: '10px 16px', fontSize: 12.5, color: color.muted }}>
        Choose what you hear about in <Link to="/settings/profile" onClick={onClose} style={{ color: color.brandStrong }}>your profile</Link>.
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useNotifications().data?.unreadCount ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
      destroyOnHidden
      styles={{ container: { padding: 0 } }}
      content={<NotificationPanel onClose={() => setOpen(false)} />}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        style={{
          position: 'relative',
          width: 38,
          height: 38,
          display: 'grid',
          placeItems: 'center',
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          background: color.surface,
          color: color.ink3,
          cursor: 'pointer',
        }}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 8,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: color.unreadDot,
            }}
          />
        )}
      </button>
    </Popover>
  );
}

export function InboxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      <div onClick={(event) => event.stopPropagation()} style={{ flex: 1, minHeight: 0, background: color.surface, display: 'flex', flexDirection: 'column' }}>
        <NotificationPanel onClose={onClose} phone />
      </div>
    </div>,
    document.body,
  );
}
