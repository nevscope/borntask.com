import { App, Button } from 'antd';
import { NavLink } from 'react-router-dom';
import type { ProjectDetail } from '../api/types';
import { Avatar } from './Chips';

export function ProjectHeader({ detail }: { detail: ProjectDetail }) {
  const { message } = App.useApp();
  const { project } = detail;
  const people = detail.members.map((m) => detail.users.find((u) => u.id === m.userId)).filter((u) => !!u);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontSize: 12.5, color: '#5B6157' }}>Projects / {project.key}</div>
          <h1 className="bt-h1" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: project.color }} />
            {project.name}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {people.map((u, i) => (
            <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: '50%', border: '2px solid #F7F8F6', display: 'inline-flex' }}>
              <Avatar user={u} size={28} />
            </span>
          ))}
          <Button
            shape="circle"
            aria-label={`Invite people to ${project.name}`}
            title="Invite people"
            style={{ marginLeft: 6, borderStyle: 'dashed' }}
            onClick={() => void message.info('Invite people opens here (designed on the canvas, not in this handoff).')}
          >
            +
          </Button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E8EBE6' }}>
        {(['list', 'board'] as const).map((view) => (
          <NavLink
            key={view}
            to={`/p/${project.key}/${view}`}
            style={({ isActive }) => ({
              height: 38,
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 13.5,
              textDecoration: 'none',
              color: isActive ? '#121417' : '#5B6157',
              fontWeight: isActive ? 600 : 400,
              borderBottom: isActive ? '2px solid #178A5C' : '2px solid transparent',
              marginBottom: -1,
            })}
          >
            {view === 'list' ? 'List' : 'Board'}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
