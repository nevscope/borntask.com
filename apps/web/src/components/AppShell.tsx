import { Button, Dropdown, Tag } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { USE_PROJECT_MOCKS, USE_TASK_MOCKS, useMe, useMyTasks, useNotifications, useProjects } from '../api/queries';
import { readRecentProjectKeys, recordRecentProject } from '../lib/recentProjects';
import { readSidebarCollapsed, writeSidebarCollapsed } from '../lib/sidebarPrefs';
import { readWelcome } from '../lib/welcome';
import { color, radius } from '../theme/tokens';
import { Avatar, WorkspaceMark } from './Chips';
import { Logo, LogoMark } from './Logo';
import { useQuickAdd } from './QuickAdd';
import { TaskDrawer } from './TaskDrawer';
import { AccountMenu, YouSheet } from './AccountMenu';
import { InboxSheet, NotificationBell } from './NotificationBell';
import { TopSearch } from './TopSearch';
import { useStatusToast } from './StatusToast';
import { useIsPhone } from '../hooks/useIsPhone';
import { useLiveUpdates } from '../hooks/useLiveUpdates';
import { OfflineBanner } from './OfflineBanner';
import { InstallPrompt, usePwaInstall } from './InstallPrompt';

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
  const isPhone = useIsPhone();
  const [shortcuts, setShortcuts] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [youOpen, setYouOpen] = useState(false);
  const [installReopen, setInstallReopen] = useState(0);
  const pwaInstall = usePwaInstall();
  const openInstall = () => setInstallReopen((n) => n + 1);
  const unread = useNotifications().data?.unreadCount ?? 0;
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
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
      if (event.key === '[') {
        event.preventDefault();
        setCollapsed((current) => {
          const next = !current;
          writeSidebarCollapsed(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [navigate, pathname]);

  useEffect(() => {
    setInboxOpen(false);
    setYouOpen(false);
  }, [pathname]);

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

  const phoneTitle = (() => {
    if (pathname === '/') return 'My tasks';
    if (pathname.startsWith('/search')) return 'Search';
    if (pathname.startsWith('/projects')) return 'Projects';
    const projectKey = pathname.match(/^\/p\/([^/]+)/)?.[1];
    if (projectKey) return projects.find((p) => p.key === projectKey)?.name ?? projectKey;
    if (pathname.startsWith('/settings')) return 'Settings';
    if (pathname.startsWith('/import')) return 'Import';
    return me?.workspace.name ?? 'BornTask';
  })();

  const openQuickAdd = () => {
    const key = pathname.match(/^\/p\/([^/]+)/)?.[1];
    quickAdd.open(key ? { projectKey: key } : {});
  };

  const accountMenu = (
    <div style={{ minWidth: 260, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 12 }}>
      <AccountMenu
        me={me}
        onClose={() => undefined}
        onShortcuts={() => setShortcuts(true)}
        installAvailable={pwaInstall.available}
        onInstall={openInstall}
      />
    </div>
  );

  return (
    <div className={`bt-shell${isPhone ? ' is-phone' : ''}`}>
      <OfflineBanner />
      <div className="bt-shell-body">
      <nav aria-label="Main" aria-hidden={isPhone} className={`bt-sidebar${collapsed ? ' is-collapsed' : ''}`}>
        <div className="bt-sidebar-scroll">
        <div className="bt-sidebar-brand">
          {collapsed ? <LogoMark size={26} /> : <Logo />}
          <button
            type="button"
            className="bt-sidebar-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu ( [ )' : 'Collapse menu ( [ )'}
            onClick={() => {
              const next = !collapsed;
              writeSidebarCollapsed(next);
              setCollapsed(next);
            }}
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>
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
            className="bt-sidebar-ws"
            title={me?.workspace.name ?? 'Workspace'}
            aria-label={me?.workspace.name ?? 'Workspace'}
          >
            <WorkspaceMark name={me?.workspace.name ?? 'Workspace'} id={me?.workspace.id} logo={me?.workspace.logo} size={20} version={meQuery.dataUpdatedAt} />
            <span className="bt-sidebar-label" style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {me?.workspace.name ?? 'Workspace'}
            </span>
          </button>
        </Dropdown>
        <NavLink to="/" end className="bt-nav-link" title="My tasks">
          <span className="bt-nav-icon"><NavIcon kind="tasks" /></span>
          <span className="bt-sidebar-label" style={{ flex: 1 }}>My tasks</span>
          <span className="bt-sidebar-label" style={{ fontSize: 12, fontWeight: 600 }}>{myCount || ''}</span>
        </NavLink>
        <NavLink to="/search" className="bt-nav-link" title="Search">
          <span className="bt-nav-icon"><NavIcon kind="search" /></span>
          <span className="bt-sidebar-label">Search</span>
        </NavLink>
        {!guest && (
          <NavLink to="/projects" className="bt-nav-link" title="Projects">
            <span className="bt-nav-icon"><NavIcon kind="projects" /></span>
            <span className="bt-sidebar-label">Projects</span>
          </NavLink>
        )}
        <div className="bt-nav-heading">{guest ? 'Your project' : 'Favourites'}</div>
        {pinned.length === 0 ? (
          <div className="bt-sidebar-copy" style={{ padding: '4px 10px', fontSize: 12.5, color: color.muted, lineHeight: 1.45 }}>
            {guest ? 'No project yet.' : 'Star a project to pin it here.'}
          </div>
        ) : pinned.map((p) => (
          <NavLink
            key={p.key}
            to={`/p/${p.key}/list`}
            title={p.name}
            className={() => `bt-nav-link bt-nav-sub${pathname.startsWith(`/p/${p.key}/`) ? ' active' : ''}`}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
            <span className="bt-sidebar-label" style={{ flex: 1 }}>{p.name}</span>
          </NavLink>
        ))}
        {!guest && recent.length > 0 && (
          <>
            <div className="bt-nav-heading">Recent</div>
            {recent.map((p) => (
              <NavLink
                key={p.key}
                to={`/p/${p.key}/list`}
                title={p.name}
                className={() => `bt-nav-link bt-nav-sub${pathname.startsWith(`/p/${p.key}/`) ? ' active' : ''}`}
              >
                <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
                <span className="bt-sidebar-label" style={{ flex: 1 }}>{p.name}</span>
              </NavLink>
            ))}
          </>
        )}
        </div>
        <div className="bt-sidebar-dock">
        {guest && (
          <div className="bt-sidebar-copy" style={{ margin: '0 4px', padding: '10px 12px', borderRadius: 8, background: color.subtle, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>
            <strong style={{ color: color.ink3 }}>Guest access.</strong> You only see the projects you were invited to.
          </div>
        )}
        {!guest && (
          <NavLink to="/settings/people" className="bt-nav-link" title="Settings">
            <span className="bt-nav-icon"><NavIcon kind="settings" /></span>
            <span className="bt-sidebar-label">Settings</span>
          </NavLink>
        )}
        {(USE_PROJECT_MOCKS || USE_TASK_MOCKS) && (
          <div className="bt-sidebar-copy" style={{ margin: '0 4px', padding: '10px 12px', borderRadius: 8, background: color.warningTint, border: `1px solid ${color.warningBorder}`, fontSize: 12.5, color: color.warning, lineHeight: 1.45 }}>
            <strong>Mocks on.</strong>{' '}
            Projects {USE_PROJECT_MOCKS ? 'mocked' : 'live'}. Tasks {USE_TASK_MOCKS ? 'mocked' : 'live'}.
          </div>
        )}
        </div>
      </nav>

      <div className="bt-main">
        <header className="bt-topbar">
          {isPhone && <LogoMark size={24} />}
          <span className="bt-phone-title">{phoneTitle}</span>
          <button type="button" className="bt-phone-search" aria-label="Search" onClick={() => navigate('/search')}>
            <PhoneIcon kind="search" />
          </button>
          <div className="bt-desktop-search"><TopSearch /></div>
          <div className="bt-desktop-actions">
            {(USE_PROJECT_MOCKS || USE_TASK_MOCKS) && <Tag color="gold">Mocks</Tag>}
            <Button type="primary" onClick={openQuickAdd} style={{ height: 38, padding: '0 14px', borderRadius: radius.md, fontSize: 13.5, fontWeight: 600 }}>
              + New task <kbd className="bt-kbd" style={{ marginLeft: 8, background: 'transparent', color: color.brandOn, borderColor: color.brandOnMuted }}>Q</kbd>
            </Button>
            <NotificationBell />
            <Dropdown trigger={['click']} dropdownRender={() => accountMenu}>
              <span style={{ cursor: 'pointer' }}><Avatar user={me?.user} size={34} /></span>
            </Dropdown>
          </div>
        </header>
        <main className="bt-main-scroll">{children}</main>
      </div>
      <nav className="bt-phone-tabs" aria-label="Main" hidden={!isPhone}>
        <NavLink to="/" end className={({ isActive }) => `bt-phone-tab${isActive ? ' active' : ''}`}>
          <PhoneIcon kind="tasks" />
          My tasks
        </NavLink>
        <NavLink to="/projects" className={() => `bt-phone-tab${pathname.startsWith('/projects') || pathname.startsWith('/p/') ? ' active' : ''}`}>
          <PhoneIcon kind="projects" />
          Projects
        </NavLink>
        <button
          type="button"
          className={`bt-phone-tab${inboxOpen ? ' active' : ''}`}
          aria-label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}
          onClick={() => {
            setYouOpen(false);
            setInboxOpen((open) => !open);
          }}
        >
          <span style={{ position: 'relative' }}>
            <PhoneIcon kind="inbox" />
            {unread > 0 && (
              <span aria-hidden="true" style={{ position: 'absolute', top: 0, right: -2, width: 7, height: 7, borderRadius: '50%', background: color.unreadDot }} />
            )}
          </span>
          Inbox
        </button>
        <button
          type="button"
          className={`bt-phone-tab${youOpen || pathname.startsWith('/settings') ? ' active' : ''}`}
          onClick={() => {
            setInboxOpen(false);
            setYouOpen((open) => !open);
          }}
        >
          <Avatar user={me?.user} size={22} fontSize={9} />
          You
        </button>
      </nav>
      <InboxSheet open={isPhone && inboxOpen} onClose={() => setInboxOpen(false)} />
      <YouSheet
        open={isPhone && youOpen}
        me={me}
        onClose={() => setYouOpen(false)}
        onShortcuts={() => setShortcuts(true)}
        installAvailable={pwaInstall.available}
        onInstall={openInstall}
      />
      <InstallPrompt reopenNonce={installReopen} install={pwaInstall} />
      <button type="button" className="bt-fab" aria-label="New task" hidden={!isPhone} onClick={openQuickAdd}>
        <PhoneIcon kind="plus" />
      </button>
      <TaskDrawer />
      {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}
      </div>
    </div>
  );
}

const SHORTCUTS = [
  ['New task', 'Q'],
  ['Search', '/'],
  ['Command palette', 'Ctrl K'],
  ['Go to My tasks', 'G M'],
  ['Switch list / board', 'V'],
  ['Collapse menu', '['],
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
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: color.overlay }}>
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

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      {collapsed ? <path d="M6 3.5 10.5 8 6 12.5" /> : <path d="M10 3.5 5.5 8 10 12.5" />}
    </svg>
  );
}

function PhoneIcon({ kind }: { kind: 'tasks' | 'search' | 'projects' | 'plus' | 'inbox' }) {
  const path = {
    tasks: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12.5l2.5 2.5 4.5-5',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
    projects: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    plus: 'M12 5v14M5 12h14',
    inbox: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  }[kind];
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={kind === 'plus' ? 2.6 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function NavIcon({ kind }: { kind: 'tasks' | 'search' | 'projects' | 'settings' }) {
  const path = {
    tasks: 'M4 7.5h8M4 11h5.5M4.8 4.4 6.2 5.8 8.8 3.2',
    search: 'M10.6 10.6 13.2 13.2M7.2 11.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
    projects: 'M3.5 4.2h4.1v4.1H3.5zM8.4 4.2h4.1v4.1H8.4zM3.5 9.1h4.1v4.1H3.5zM8.4 9.1h4.1v4.1H8.4z',
    settings: 'M8 10.2A2.2 2.2 0 1 0 8 5.8a2.2 2.2 0 0 0 0 4.4zM8 2.6v1.4M8 12v1.4M3.8 4.4l1 1M11.2 10.6l1 1M2.6 8h1.4M12 8h1.4M3.8 11.6l1-1M11.2 5.4l1-1',
  }[kind];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

