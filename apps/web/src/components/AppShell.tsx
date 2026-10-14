import { Button, Dropdown, Input, Tag } from 'antd';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { USE_MOCKS, USE_PROJECT_MOCKS, USE_TASK_MOCKS, useMe, useMyTasks, useProjects } from '../api/queries';
import { Avatar } from './Chips';
import { Logo } from './Logo';
import { useQuickAdd } from './QuickAdd';
import { TaskDrawer } from './TaskDrawer';

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe().data;
  const projects = useProjects().data ?? [];
  const myTasks = useMyTasks().data;
  const quickAdd = useQuickAdd();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const myCount = (myTasks?.assigned.length ?? 0) + (myTasks?.approvals.length ?? 0);
  const workspaces = me?.workspaces ?? [];

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
        <NavLink to="/projects" className="bt-nav-link">Projects</NavLink>
        <div className="bt-nav-heading">Projects</div>
        {projects.map((p) => (
          <NavLink
            key={p.key}
            to={`/p/${p.key}/list`}
            className={() => `bt-nav-link${pathname.startsWith(`/p/${p.key}/`) ? ' active' : ''}`}
          >
            <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
            <span style={{ flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 12, color: '#5B6157' }}>{p.openCount}</span>
          </NavLink>
        ))}
        <div style={{ flex: 1, minHeight: 24 }} />
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
          <Input
            aria-label="Search tasks"
            placeholder="Search tasks or jump to WEB-142"
            suffix={<kbd className="bt-kbd">/</kbd>}
            style={{ flex: '1 1 280px', maxWidth: 520, background: '#FAFBF9' }}
            onFocus={() => navigate('/search')}
            onPressEnter={(e) => navigate(`/search?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`)}
          />
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

      <TaskDrawer />
    </div>
  );
}
