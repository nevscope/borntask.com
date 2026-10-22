import { color } from '../theme/tokens';

const ROLES = [
  {
    name: 'Owner',
    text: 'Sees every project in the workspace. Can change billing, people, and transfer ownership.',
  },
  {
    name: 'Admin',
    text: 'Sees projects they created or were invited to. They can also see other projects and ask for access. They can invite people and change roles, except the owner.',
  },
  {
    name: 'Member',
    text: 'Sees only projects they were invited to. They can create projects and work on the ones they can open.',
  },
  {
    name: 'Guest',
    text: 'Sees only invited projects. They are not in the member directory. Used for people outside your sign-in domain.',
  },
  {
    name: 'Viewer',
    text: 'Sees only invited projects. They can look at list, board and task detail, but cannot create, edit, move, comment or import.',
  },
] as const;

export function WorkspaceRolesAside() {
  return (
    <aside
      aria-label="Workspace roles"
      className="bt-card"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start', position: 'sticky', top: 0 }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Workspace roles</h2>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: color.muted, lineHeight: 1.45 }}>
          A role decides which projects a person can see. Project roles (lead, developer, and so on) still decide who can move work.
        </p>
      </div>
      {ROLES.map((role) => (
        <div key={role.name}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{role.name}</div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: color.ink3, lineHeight: 1.45 }}>{role.text}</p>
        </div>
      ))}
    </aside>
  );
}
