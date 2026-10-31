import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useProject } from '../api/queries';
import { useIsPhone } from '../hooks/useIsPhone';
import { color } from '../theme/tokens';

const projectLinks = (key: string) => [
  { to: `/p/${key}/settings/details`, label: 'Name, colour and workflow' },
  { to: `/p/${key}/settings/members`, label: 'Members' },
  { to: `/p/${key}/settings/structure`, label: 'Sections, types and trash' },
  { to: `/p/${key}/settings/workflow`, label: 'Workflow' },
  { to: `/p/${key}/settings/chat`, label: 'Google Chat' },
  { to: `/p/${key}/settings/github`, label: 'GitHub' },
];

const workspaceLinks = (canAdmin: boolean, isOwner: boolean) => [
  { to: '/settings/workspace', label: 'General', show: canAdmin },
  { to: '/settings/people', label: 'People and invitations', show: true },
  { to: '/settings/defaults', label: 'Roles, types and workflows', show: canAdmin },
  { to: '/settings/workflow', label: 'Workflow editor', show: canAdmin },
  { to: '/settings/billing', label: 'Billing', show: isOwner || canAdmin },
];

const youLinks = [
  { to: '/settings/profile', label: 'Profile and notifications' },
  { to: '/settings/tokens', label: 'API tokens and MCP' },
  { to: '/settings/privacy', label: 'Privacy' },
  { to: '/settings/terms', label: 'Terms of use' },
];

export function SettingsNav({
  projectKey,
  canAdmin,
  isOwner,
}: {
  projectKey?: string;
  canAdmin: boolean;
  isOwner?: boolean;
}) {
  const project = useProject(projectKey ?? '');
  const heading = project.data?.project.name ?? (projectKey ? 'This project' : undefined);

  return (
    <nav aria-label="Settings" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {projectKey ? (
        <>
          <div className="bt-nav-heading" style={{ paddingTop: 0 }}>{heading}</div>
          {projectLinks(projectKey).map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `bt-nav-link bt-nav-sub${isActive ? ' active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
        </>
      ) : (
        <>
          <div className="bt-nav-heading">Workspace</div>
          {workspaceLinks(canAdmin, !!isOwner).filter((l) => l.show).map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `bt-nav-link bt-nav-sub${isActive ? ' active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
          <div className="bt-nav-heading">You</div>
          {youLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `bt-nav-link bt-nav-sub${isActive ? ' active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
        </>
      )}
    </nav>
  );
}

export function SettingsFrame({
  projectKey,
  canAdmin,
  isOwner,
  children,
}: {
  projectKey?: string;
  canAdmin: boolean;
  isOwner?: boolean;
  children: ReactNode;
}) {
  const project = useProject(projectKey ?? '');
  const isPhone = useIsPhone();
  const backTo = projectKey ? `/p/${projectKey}/list` : '/';
  const backLabel = projectKey ? (project.data?.project.name ?? 'the project') : 'My tasks';
  return (
    <div
      className="bt-page"
      style={{
        flexDirection: isPhone ? 'column' : 'row',
        alignItems: 'flex-start',
        gap: isPhone ? 16 : 28,
        flexWrap: isPhone ? 'nowrap' : 'wrap',
        background: color.canvas,
      }}
    >
      <div
        style={{
          flex: isPhone ? 'none' : '0 1 220px',
          width: isPhone ? '100%' : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          position: isPhone ? 'relative' : 'sticky',
          top: 0,
          alignSelf: 'stretch',
          maxHeight: isPhone ? 'none' : '100%',
          overflow: 'auto',
          background: color.canvas,
          zIndex: isPhone ? 0 : 1,
        }}
      >
        <Link to={backTo} style={{ fontSize: 13, color: color.muted, textDecoration: 'none' }}>← Back to {backLabel}</Link>
        <SettingsNav projectKey={projectKey} canAdmin={canAdmin} isOwner={isOwner} />
      </div>
      <div style={{ flex: isPhone ? '1 1 auto' : '999 1 560px', minWidth: 0, width: isPhone ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  );
}
