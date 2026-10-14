import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const projectLinks = (key: string) => [
  { to: `/p/${key}/settings/members`, label: 'Members' },
  { to: `/p/${key}/settings/structure`, label: 'Sections, types and trash' },
];

const workspaceLinks = [
  { to: '/settings/workspace', label: 'General', owner: true },
  { to: '/settings/people', label: 'People and invitations', owner: false },
  { to: '/settings/defaults', label: 'Roles, types and workflows', owner: true },
  { to: '/settings/workflow', label: 'Workflow editor', owner: true },
];

export function SettingsNav({
  projectKey,
  canAdmin,
}: {
  projectKey?: string;
  canAdmin: boolean;
}) {
  return (
    <nav aria-label="Settings" style={{ flex: '0 1 220px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {projectKey && (
        <>
          <div className="bt-nav-heading" style={{ paddingTop: 0 }}>This project</div>
          {projectLinks(projectKey).map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `bt-nav-link${isActive ? ' active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
        </>
      )}
      <div className="bt-nav-heading">Workspace</div>
      {workspaceLinks.filter((l) => !l.owner || canAdmin).map((l) => (
        <NavLink key={l.to} to={l.to} className={({ isActive }) => `bt-nav-link${isActive ? ' active' : ''}`}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function SettingsFrame({
  projectKey,
  canAdmin,
  children,
}: {
  projectKey?: string;
  canAdmin: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bt-page" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 28, flexWrap: 'wrap' }}>
      <SettingsNav projectKey={projectKey} canAdmin={canAdmin} />
      <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  );
}
