import { Button, Input } from 'antd';
import { useParams } from 'react-router-dom';
import { useMe } from '../api/queries';
import { SettingsFrame } from '../components/SettingsNav';
import { color, font } from '../theme/tokens';

export function GitHubSettingsScreen() {
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">GitHub</h1>
      <p style={{ color: color.muted, margin: '6px 0 0' }}>Link branches, pull requests and commits to tasks, and move tasks automatically as code moves.</p>
      <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: color.ink, color: color.surface, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>GH</span>
        <span style={{ flex: '1 1 280px' }}>
          <span style={{ display: 'block', fontWeight: 600 }}>GitHub App is not installed yet</span>
          <span style={{ fontSize: 13, color: color.muted }}>When it is, branches and pull requests that mention a task key such as WEB-142 will link here.</span>
        </span>
        <Button disabled>Install GitHub App</Button>
      </section>
      <section className="bt-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>How tasks are recognised</span>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: color.ink3 }}>
          Any branch, PR title or commit containing <code style={{ fontFamily: font.mono, fontSize: 12.5, padding: '1px 6px', borderRadius: 5, background: color.chip }}>{projectKey}-142</code> links to that task.
        </span>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
          Suggested branch name
          <Input value="{type}/{key}-{title}" readOnly style={{ fontFamily: font.mono, fontSize: 13 }} />
        </label>
      </section>
    </SettingsFrame>
  );
}
