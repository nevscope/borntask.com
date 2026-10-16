import { Button, Dropdown, Tag } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { USE_PROJECT_MOCKS, USE_TASK_MOCKS, useMe, useMyTasks, useProjects } from '../api/queries';
import { readRecentProjectKeys, recordRecentProject } from '../lib/recentProjects';
import { readWelcome } from '../lib/welcome';
import { color, radius } from '../theme/tokens';
import { Avatar, WorkspaceMark } from './Chips';
import { Logo } from './Logo';
import { useQuickAdd } from './QuickAdd';
import { TaskDrawer } from './TaskDrawer';
import { NotificationBell } from './NotificationBell';
import { TopSearch } from './TopSearch';
import { useStatusToast } from './StatusToast';
import { useLiveUpdates } from '../hooks/useLiveUpdates';

export function AppShell({ children }: { children: ReactNode }) {
  const meQuery = useMe();
  const me = meQuery.data;
  const projects = useProjects().data ?? [];
  const myTasks = useMyTasks().data;
  const quickAdd = useQuickAdd();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome');
  const [shortcuts, setShortcuts] = useState(false);
  const joined = useStatusToast();
  const stored = welcome ? readWelcome() : null;
  const guest = me?.workspaceRole === 'guest';
  const workspaceId = me?.workspace.id;
  const favourites = projects.filter((p) => p.starred);
  const favouriteKeys = new Set(favourites.map((p) => p.key));
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const recent = recentKeys
    .map((key) => projects.find((p) => p.key === key))
    .filter((p): p is NonNullable<typeof p> => p !== undefined && !favouriteKeys.has(p.key))
    .slice(0, 10);
  const myCount = (myTasks?.assigned.length ?? 0) + (myTasks?.approvals.length ?? 0);
  useLiveUpdates(Boolean(me));
  const workspaces = me?.workspaces ?? [];
  const pinned = guest ? projects : favourites;

  useEffect(() => {
    if (me?.workspaces && me.workspaces.length === 0) {
      navigate('/create-workspace', { replace: true });
    }
  }, [me, navigate]);

  useEffect(() => {
    if (welcome !== 'member') return;
    joined.show({
      text: <>You've joined <strong>{stored?.workspaceName || me?.workspace.name || 'the workspace'}</strong></>,
    });
  }, [welcome]);

  useEffect(() => {
    let armed = false;
    let timer = 0;
    const typing = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      return !!node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable);
    };
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '?') {
        event.preventDefault();
        setShortcuts(true);
        return;
      }
      if (event.key.toLowerCase() === 'g') {
        armed = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { armed = false; }, 800);
        return;
      }
      if (armed && event.key.toLowerCase() === 'm') {
        armed = false;
        navigate('/');
        return;
      }
      if (event.key.toLowerCase() === 'v') {
        const match = pathname.match(/^\/p\/([^/]+)\/(list|board)/);
        if (match?.[1] && match[2]) navigate(`/p/${match[1]}/${match[2] === 'list' ? 'board' : 'list'}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [navigate, pathname]);

  useEffect(() => {
    if (!workspaceId) {
      setRecentKeys([]);
      return;
    }
    setRecentKeys(readRecentProjectKeys(workspaceId));
    const match = pathname.match(/^\/p\/([^/]+)/);
    if (match?.[1]) {
      setRecentKeys(recordRecentProject(workspaceId, match[1]));
    }
  }, [pathname, workspaceId]);

  return (
    <div className="bt-shell">
      <nav aria-label="Main" className="bt-sidebar">
        <div style={{ padding: '4px 10px 14px' }}><Logo /></div>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              ...workspaces.map((w) => ({
                key: w.id,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <WorkspaceMark name={w.name} id={w.id} logo={w.logo} size={18} version={meQuery.dataUpdatedAt} />
                    {w.name}
                  </span>
                ),
              })),
              { type: 'divider' as const },
              { key: 'create', label: 'Create workspace' },
            ],
            onClick: ({ key }) => {
              if (key === 'create') {
                navigate('/create-workspace');
                return;
              }
              void fetch(`${BASE_URL}/me/workspace`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId: key }),
              }).then(() => window.location.reload());
            },
          }}
        >
          <button
            type="button"
            style={{ height: 36, width: '100%', margin: '0 0 10px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${color.border}`, borderRadius: 8, background: color.subtle, fontSize: 13, color: color.ink3, cursor: 'pointer', font: 'inherit' }}
          >
            <WorkspaceMark name={me?.workspace.name ?? 'Workspace'} id={me?.workspace.id} logo={me?.workspace.logo} size={20} version={meQuery.dataUpdatedAt} />
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {me?.workspace.name ?? 'Workspace'}
            </span>
          </button>
        </Dropdown>
        <NavLink to="/" end className="bt-nav-link">
          <span style={{ flex: 1 }}>My tasks</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{myCount || ''}</span>
        </NavLink>
        <NavLink to="/search" className="bt-nav-link">Search</NavLink>
        {!guest && <NavLink to="/projects" className="bt-nav-link">Projects</NavLink>}
        <div className="bt-nav-heading">{guest ? 'Your project' : 'Favourites'}</div>
        {pinned.length === 0 ? (
          <div style={{ padding: '4px 10px', fontSize: 12.5, color: color.muted, lineHeight: 1.45 }}>
            {guest ? 'No project yet.' : 'Star a project to pin it here.'}
          </div>
        ) : pinned.map((p) => (
          <NavLink
            key={p.key}
            to={`/p/${p.key}/list`}
            className={() => `bt-nav-link bt-nav-sub${pathname.startsWith(`/p/${p.key}/`) ? ' active' : ''}`}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
            <span style={{ flex: 1 }}>{p.name}</span>
          </NavLink>
        ))}
        {!guest && recent.length > 0 && (
          <>
            <div className="bt-nav-heading">Recent</div>
            {recent.map((p) => (
              <NavLink
                key={p.key}
                to={`/p/${p.key}/list`}
                className={() => `bt-nav-link bt-nav-sub${pathname.startsWith(`/p/${p.key}/`) ? ' active' : ''}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
                <span style={{ flex: 1 }}>{p.name}</span>
              </NavLink>
            ))}
          </>
        )}
        <div style={{ flex: 1, minHeight: 24 }} />
        {guest && (
          <div style={{ margin: '0 4px', padding: '10px 12px', borderRadius: 8, background: color.subtle, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>
            <strong style={{ color: color.ink3 }}>Guest access.</strong> You only see the projects you were invited to.
          </div>
        )}
        {!guest && <NavLink to="/settings/people" className="bt-nav-link">Settings</NavLink>}
        {(USE_PROJECT_MOCKS || USE_TASK_MOCKS) && (
          <div style={{ margin: '0 4px', padding: '10px 12px', borderRadius: 8, background: color.warningTint, border: `1px solid ${color.warningBorder}`, fontSize: 12.5, color: color.warning, lineHeight: 1.45 }}>
            <strong>Mocks on.</strong>{' '}
            Projects {USE_PROJECT_MOCKS ? 'mocked' : 'live'}. Tasks {USE_TASK_MOCKS ? 'mocked' : 'live'}.
          </div>
        )}
      </nav>

      <div className="bt-main">
        <header className="bt-topbar">
          <TopSearch />
          <div style={{ flex: 1 }} />
          {(USE_PROJECT_MOCKS || USE_TASK_MOCKS) && <Tag color="gold">Mocks</Tag>}
          <Button type="primary" onClick={() => {
            const key = pathname.match(/^\/p\/([^/]+)/)?.[1];
            quickAdd.open(key ? { projectKey: key } : {});
          }} style={{ height: 38, padding: '0 14px', borderRadius: radius.md, fontSize: 13.5, fontWeight: 600 }}>
            + New task <kbd className="bt-kbd" style={{ marginLeft: 8, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>Q</kbd>
          </Button>
          <NotificationBell />
          <Dropdown
            trigger={['click']}
            dropdownRender={() => (
              <div role="menu" aria-label="Account" style={{ minWidth: 260, padding: 6, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 10px' }}>
                  <Avatar user={me?.user} size={32} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 600 }}>{me?.user.name ?? 'Account'}</span>
                    <span style={{ fontSize: 12.5, color: color.muted }}>{me?.user.email}</span>
                  </span>
                </div>
                <MenuLink onClick={() => navigate('/settings/profile')}>Profile and notifications</MenuLink>
                <MenuLink onClick={() => navigate('/settings/tokens')}>Connected apps and tokens</MenuLink>
                <MenuLink onClick={() => setShortcuts(true)}>
                  <span style={{ flex: 1 }}>Keyboard shortcuts</span>
                  <kbd className="bt-kbd">?</kbd>
                </MenuLink>
                <div style={{ height: 1, margin: '4px 6px', background: color.divider }} />
                <MenuLink danger onClick={() => {
                  void fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).then(() => {
                    window.location.href = '/sign-in';
                  });
                }}>Sign out</MenuLink>
              </div>
            )}
          >
            <span style={{ cursor: 'pointer' }}><Avatar user={me?.user} size={34} /></span>
          </Dropdown>
        </header>
        <main>{children}</main>
      </div>
      <TaskDrawer />
      {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}
    </div>
  );
}

const SHORTCUTS = [
  ['New task', 'Q'],
  ['Search', '/'],
  ['Command palette', 'Ctrl K'],
  ['Go to My tasks', 'G M'],
  ['Switch list / board', 'V'],
  ['Assign to me', 'I'],
  ['Set due date', 'D'],
  ['Change status', 'S'],
  ['Priority', '1-4'],
  ['Open selected task', 'Enter'],
] as const;

function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(18, 20, 23, 0.22)' }}>
      <div role="dialog" aria-label="Keyboard shortcuts" onClick={(event) => event.stopPropagation()} style={{ position: 'absolute', top: 72, right: 24, width: 320, padding: '14px 16px', background: color.surface, border: `1px solid ${color.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: color.muted }}>Keyboard shortcuts</span>
        {SHORTCUTS.map(([label, key]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
            <span style={{ flex: 1, color: color.ink3 }}>{label}</span>
            <kbd className="bt-kbd">{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuLink({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} style={{ display: 'flex', alignItems: 'center', minHeight: 36, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', font: 'inherit', fontSize: 13.5, textAlign: 'left', color: danger ? color.danger : color.ink, cursor: 'pointer' }}>
      {children}
    </button>
  );
}
