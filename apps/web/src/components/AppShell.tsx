import { Button, Dropdown, Tag } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { USE_MOCKS, USE_PROJECT_MOCKS, USE_TASK_MOCKS, useMe, useMyTasks, useProjects } from '../api/queries';
import { readWelcome } from '../lib/welcome';
import { color } from '../theme/tokens';
import { Avatar } from './Chips';
import { Logo } from './Logo';
import { useQuickAdd } from './QuickAdd';
import { TaskDrawer } from './TaskDrawer';
import { TopSearch } from './TopSearch';

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe().data;
  const projects = useProjects().data ?? [];
  const myTasks = useMyTasks().data;
  const quickAdd = useQuickAdd();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome');
  const [toastOn, setToastOn] = useState(true);
  const stored = welcome ? readWelcome() : null;
  const guest = me?.workspaceRole === 'guest';
  const favourites = projects.filter((p) => p.starred);
  const myCount = (myTasks?.assigned.length ?? 0) + (myTasks?.approvals.length ?? 0);
  const workspaces = me?.workspaces ?? [];
  const pinned = guest ? projects : favourites;

  useEffect(() => {
    if (me?.workspaces && me.workspaces.length === 0) {
      navigate('/create-workspace', { replace: true });
    }
  }, [me, navigate]);

  return (
    <div className="bt-shell">
      <nav aria-label="Main" className="bt-sidebar">
        <div style={{ padding: '4px 10px 14px' }}><Logo /></div>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              ...workspaces.map((w) => ({ key: w.id, label: w.name })),
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
            style={{ height: 36, width: '100%', margin: '0 0 10px', padding: '0 10px', display: 'flex', alignItems: 'center', border: '1px solid #E8EBE6', borderRadius: 8, background: '#FAFBF9', fontSize: 13, color: '#3A3F38', cursor: 'pointer', font: 'inherit' }}
          >
            {me?.workspace.name ?? 'Workspace'}
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
            className={() => `bt-nav-link${pathname.startsWith(`/p/${p.key}/`) ? ' active' : ''}`}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
            <span style={{ flex: 1 }}>{p.name}</span>
          </NavLink>
        ))}
        <div style={{ flex: 1, minHeight: 24 }} />
        {guest && (
          <div style={{ margin: '0 4px', padding: '10px 12px', borderRadius: 8, background: color.subtle, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>
            <strong style={{ color: color.ink3 }}>Guest access.</strong> You only see the projects you were invited to.
          </div>
        )}
        {!guest && <NavLink to="/settings/people" className="bt-nav-link">Settings</NavLink>}
        {USE_MOCKS && (
          <div style={{ margin: '0 4px', padding: '10px 12px', borderRadius: 8, background: '#FFFBF2', border: '1px solid #F1D6A6', fontSize: 12.5, color: '#5C3D07', lineHeight: 1.45 }}>
            <strong>{USE_PROJECT_MOCKS || USE_TASK_MOCKS ? 'Mocks on.' : 'Live API with mock fallback.'}</strong>{' '}
            Projects {USE_PROJECT_MOCKS ? 'mocked' : 'live'}. Tasks {USE_TASK_MOCKS ? 'mocked' : 'live'}.
            Set VITE_MOCK_PROJECTS=false and VITE_MOCK_TASKS=false in apps/web/.env after sign-in, then restart Vite.
          </div>
        )}
      </nav>

      <div className="bt-main">
        <header className="bt-topbar">
          <TopSearch />
          <div style={{ flex: 1 }} />
          {USE_MOCKS && <Tag color="gold">{USE_PROJECT_MOCKS || USE_TASK_MOCKS ? 'Mocks' : 'API + fallback'}</Tag>}
          <Button type="primary" onClick={() => quickAdd.open()}>
            + New task <kbd className="bt-kbd" style={{ marginLeft: 4, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>Q</kbd>
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'projects', label: 'Projects' },
                { key: 'people', label: 'People and invitations' },
                { key: 'defaults', label: 'Roles, types and workflows' },
                { key: 'ws', label: 'Workspace general' },
                { key: 'wf', label: 'Workflow editor' },
                { key: 'out', label: 'Sign out' },
              ],
              onClick: ({ key }) => {
                if (key === 'projects') navigate('/projects');
                if (key === 'people') navigate('/settings/people');
                if (key === 'defaults') navigate('/settings/defaults');
                if (key === 'ws') navigate('/settings/workspace');
                if (key === 'wf') navigate('/settings/workflow');
                if (key === 'out') {
                  void fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).then(() => {
                    window.location.href = '/sign-in';
                  });
                }
              },
            }}
          >
            <span style={{ cursor: 'pointer' }}><Avatar user={me?.user} size={34} /></span>
          </Dropdown>
        </header>
        <main>{children}</main>
      </div>
      {welcome && toastOn && (
        <div role="status" style={{ position: 'fixed', top: 72, right: 24, zIndex: 30, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', maxWidth: 360, background: color.ink, color: color.surface, borderRadius: 10, fontSize: 13.5 }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', background: color.brand, flex: 'none' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color.surface} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </span>
          <span style={{ flex: 1 }}>You've joined <strong>{stored?.workspaceName || me?.workspace.name || 'the workspace'}</strong></span>
          <button type="button" aria-label="Dismiss" onClick={() => setToastOn(false)} style={{ border: 0, background: 'transparent', color: color.surface, cursor: 'pointer', font: 'inherit' }}>×</button>
        </div>
      )}

      <TaskDrawer />
    </div>
  );
}
