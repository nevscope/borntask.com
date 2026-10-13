import { Button, Input, Tag } from 'antd';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { USE_MOCKS, useMe, useMyTasks, useProjects } from '../api/queries';
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
  const myCount = (myTasks?.assigned.length ?? 0) + (myTasks?.approvals.length ?? 0);

  return (
    <div className="bt-shell">
      <nav aria-label="Main" className="bt-sidebar">
        <div style={{ padding: '4px 10px 14px' }}><Logo /></div>
        <div style={{ height: 36, margin: '0 0 10px', padding: '0 10px', display: 'flex', alignItems: 'center', border: '1px solid #E8EBE6', borderRadius: 8, background: '#FAFBF9', fontSize: 13, color: '#3A3F38' }}>
          {me?.workspace.name ?? ' '}
        </div>
        <NavLink to="/" end className="bt-nav-link">
          <span style={{ flex: 1 }}>My tasks</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{myCount || ''}</span>
        </NavLink>
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
            <strong>Mock data.</strong> Changes live in memory until reload (VITE_USE_MOCKS=true).
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
          />
          <div style={{ flex: 1 }} />
          {USE_MOCKS && <Tag color="gold">Mocks</Tag>}
          <Button type="primary" onClick={() => quickAdd.open()}>
            + New task <kbd className="bt-kbd" style={{ marginLeft: 4, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>Q</kbd>
          </Button>
          <Avatar user={me?.user} size={34} />
        </header>
        <main>{children}</main>
      </div>

      <TaskDrawer />
    </div>
  );
}
