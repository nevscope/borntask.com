import { Dropdown } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAcceptProjectInvite, useMarkNotificationsRead, useMe, useNotifications, useProjects, useResolveAccessRequest } from '../api/queries';
import type { Notification } from '../api/types';
import {
  collapseBellItems,
  groupBellByDate,
  inTab,
  itemHeading,
  matchesFilters,
  updateSummary,
  type BellChip,
  type BellItem,
  type BellTab,
} from '../lib/bellInbox';
import { formatWhen } from '../lib/relativeTime';
import { color, font, radius } from '../theme/tokens';
import { useStatusToast } from './StatusToast';
import { Avatar } from './Chips';

const TABS: { id: BellTab; label: string }[] = [
  { id: 'action', label: 'Needs action' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'updates', label: 'Updates' },
  { id: 'all', label: 'All' },
];

function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        padding: '0 10px',
        border: `1px solid ${active ? color.ink : color.border}`,
        borderRadius: 999,
        background: active ? color.ink : color.surface,
        color: active ? color.inverseFg : color.ink3,
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function goTo(note: Notification, navigate: ReturnType<typeof useNavigate>) {
  if (note.kind === 'access_request' && note.projectKey) {
    navigate(`/p/${note.projectKey}/settings/members`);
    return;
  }
  if (note.taskKey && note.projectKey) {
    navigate(`/p/${note.projectKey}/list?task=${note.taskKey}`);
    return;
  }
  if (note.projectKey) navigate(`/p/${note.projectKey}/list`);
}

function NotificationRow({
  item,
  active,
  unread,
  busy,
  onOpen,
  onResolve,
}: {
  item: BellItem;
  active: boolean;
  unread: boolean;
  busy: boolean;
  onOpen: (item: BellItem) => void;
  onResolve: (item: BellItem, action: 'accept' | 'decline') => void;
}) {
  const note = item.latest;
  const summary = updateSummary(item);
  const mention = note.kind === 'mention' ? note.text : null;
  const pendingAccess = note.kind === 'access_request' && !note.outcome && Boolean(note.requestId && note.projectKey);
  const sub = [summary, mention && !summary ? mention : null, formatWhen(note.createdAt)].filter(Boolean).join(' · ');
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        width: '100%',
        padding: '10px 16px',
        borderLeft: `3px solid ${active ? color.brand : 'transparent'}`,
        borderBottom: `1px solid ${color.divider}`,
        background: active ? color.brandTint : unread ? color.unreadRow : color.surface,
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        style={{
          display: 'flex',
          gap: 10,
          flex: 1,
          minWidth: 0,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: color.ink,
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <Avatar user={note.actor} size={28} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13.5, lineHeight: 1.35, fontWeight: unread ? 600 : 500 }}>{itemHeading(item)}</span>
          <span style={{ fontSize: 12, color: color.muted, lineHeight: 1.4 }}>{sub}</span>
        </span>
      </button>
      {pendingAccess && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', justifyContent: 'center' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(item, 'accept')}
            style={{
              height: 26,
              padding: '0 10px',
              border: 0,
              borderRadius: radius.sm,
              background: color.brand,
              color: color.brandOn,
              font: 'inherit',
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(item, 'decline')}
            style={{
              height: 26,
              padding: '0 10px',
              border: `1px solid ${color.border}`,
              borderRadius: radius.sm,
              background: color.surface,
              color: color.ink,
              font: 'inherit',
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Decline
          </button>
        </span>
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

export function NotificationPanel({ onClose }: { onClose: () => void; phone?: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useStatusToast();
  const meId = useMe().data?.user.id;
  const projects = useProjects().data ?? [];
  const list = useNotifications().data;
  const mark = useMarkNotificationsRead();
  const accept = useAcceptProjectInvite();
  const resolveAccess = useResolveAccessRequest();
  const [tab, setTab] = useState<BellTab>('action');
  const [chips, setChips] = useState<Set<BellChip>>(() => new Set());
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const items = list?.items ?? [];
  const unreadCount = list?.unreadCount ?? 0;
  const currentTask = params.get('task');

  const filtered = useMemo(
    () => items.filter((note) => matchesFilters(note, chips, meId, projectKey)),
    [items, chips, meId, projectKey],
  );
  const tabCounts = useMemo(() => ({
    action: filtered.filter((note) => inTab(note, 'action')).length,
    mentions: filtered.filter((note) => inTab(note, 'mentions')).length,
    updates: collapseBellItems(filtered.filter((note) => inTab(note, 'updates'))).length,
    all: collapseBellItems(filtered).length,
  }), [filtered]);
  const shown = useMemo(
    () => collapseBellItems(filtered.filter((note) => inTab(note, tab))),
    [filtered, tab],
  );
  const groups = useMemo(() => groupBellByDate(shown), [shown]);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const toggleChip = (chip: BellChip) => {
    setChips((current) => {
      const next = new Set(current);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  };

  const open = (item: BellItem) => {
    setActiveId(item.id);
    const unreadIds = item.ids.filter((id) => items.find((note) => note.id === id && !note.readAt));
    if (unreadIds.length) mark.mutate({ ids: unreadIds });
    const note = item.latest;
    if (note.needsAccept && note.projectKey) {
      void accept.mutateAsync(note.projectKey).then(() => goTo(note, navigate)).catch((err: unknown) => {
        toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not join this project.' });
      });
      return;
    }
    goTo(note, navigate);
  };

  const resolve = (item: BellItem, action: 'accept' | 'decline') => {
    const note = item.latest;
    if (!note.projectKey || !note.requestId) return;
    resolveAccess.mutate({ projectKey: note.projectKey, id: note.requestId, action }, {
      onError: (err: unknown) => {
        toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update that request.' });
      },
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'j' && event.key !== 'k' && event.key !== 'J' && event.key !== 'K') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (flat.length === 0) return;
      event.preventDefault();
      const current = Math.max(0, flat.findIndex((item) => item.id === activeId || item.latest.taskKey === currentTask));
      const delta = event.key.toLowerCase() === 'j' ? 1 : -1;
      const next = flat[Math.min(flat.length - 1, Math.max(0, current + delta))];
      if (next) open(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, activeId, currentTask, items]);

  const projectLabel = projectKey
    ? (projects.find((project) => project.key === projectKey)?.name ?? projectKey)
    : 'All projects';
  const projectKeys = [...new Set(items.map((note) => note.projectKey).filter((key): key is string => Boolean(key)))];

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: color.surface,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px 0', borderBottom: `1px solid ${color.divider}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: font.display, fontWeight: 600, fontSize: 16, flex: 1, minWidth: 0 }}>Notifications</span>
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
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            Mark all read
          </button>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              border: 0,
              borderRadius: radius.sm,
              background: 'transparent',
              color: color.ink3,
              cursor: 'pointer',
            }}
          >
            <CloseIcon />
          </button>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map((row) => {
            const selected = tab === row.id;
            const count = tabCounts[row.id];
            return (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(row.id)}
                style={{
                  height: 34,
                  padding: '0 10px',
                  border: 0,
                  borderBottom: `2px solid ${selected ? color.brand : 'transparent'}`,
                  background: 'transparent',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: selected ? 600 : 500,
                  color: selected ? color.ink : color.ink3,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {row.label}
                {row.id !== 'all' && (
                  <span style={{
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: selected ? color.brand : color.chip,
                    color: selected ? color.brandOn : color.ink3,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingBottom: 12 }}>
          <Chip active={chips.has('reported')} onClick={() => toggleChip('reported')}>Reported by me</Chip>
          <Chip active={chips.has('assigned')} onClick={() => toggleChip('assigned')}>Assigned</Chip>
          <Chip active={chips.has('access')} onClick={() => toggleChip('access')}>Access</Chip>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'all', label: 'All projects' },
                ...projectKeys.map((key) => ({
                  key,
                  label: projects.find((project) => project.key === key)?.name ?? key,
                })),
              ],
              onClick: ({ key }) => setProjectKey(key === 'all' ? null : key),
            }}
          >
            <button
              type="button"
              style={{
                height: 28,
                padding: '0 10px',
                border: `1px solid ${color.border}`,
                borderRadius: 999,
                background: color.surface,
                color: color.ink3,
                font: 'inherit',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {projectLabel}
            </button>
          </Dropdown>
        </div>
      </div>
      {shown.length === 0 ? (
        <div style={{ padding: '28px 16px', fontSize: 13.5, color: color.muted, textAlign: 'center', flex: 1 }}>
          {tab === 'action' ? 'Nothing waiting on you.' : 'No notifications in this tab.'}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {groups.map((group) => {
            const unreadIds = group.items.flatMap((item) => item.ids).filter((id) => items.find((note) => note.id === id && !note.readAt));
            return (
              <section key={group.label} aria-label={group.label}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px 4px',
                    background: color.subtle,
                    borderBottom: `1px solid ${color.divider}`,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: color.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>{group.label}</span>
                  {unreadIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => mark.mutate({ ids: unreadIds })}
                      style={{
                        marginLeft: 'auto',
                        border: 0,
                        background: 'transparent',
                        font: 'inherit',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        color: color.brandStrong,
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    unread={item.ids.some((id) => items.some((note) => note.id === id && !note.readAt))}
                    active={item.id === activeId || Boolean(item.latest.taskKey && item.latest.taskKey === currentTask)}
                    busy={resolveAccess.isPending && resolveAccess.variables?.id === item.latest.requestId}
                    onOpen={open}
                    onResolve={resolve}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
      <div style={{ padding: '10px 16px', fontSize: 12.5, color: color.muted }}>
        Choose what you hear about in <Link to="/settings/profile" style={{ color: color.brandStrong }}>your profile</Link>.
      </div>
    </div>
  );
}

export function NotificationBell({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const unread = useNotifications().data?.unreadCount ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
      style={{
        position: 'relative',
        width: 38,
        height: 38,
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${open ? color.brandBorder : color.border}`,
        borderRadius: radius.md,
        background: open ? color.brandTint : color.surface,
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
  );
}

export function InboxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return createPortal(
    <div
      role="presentation"
      className="bt-phone-sheet"
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
      <div style={{ flex: 1, minHeight: 0, background: color.surface, display: 'flex', flexDirection: 'column' }}>
        <NotificationPanel onClose={onClose} phone />
      </div>
    </div>,
    document.body,
  );
}
