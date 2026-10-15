import { Checkbox, Input, Select } from 'antd';
import { useMe } from '../api/queries';
import { Avatar } from '../components/Chips';
import { SettingsFrame } from '../components/SettingsNav';
import { color } from '../theme/tokens';

const ROWS = [
  'I am assigned a task',
  'I am @mentioned in a comment',
  'A task I watch moves stage',
  'Someone comments on a task I watch',
  'A task I reported is deployed',
  'Someone requests access to a project',
  'Daily digest is ready',
];

export function ProfileSettingsScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">Profile and notifications</h1>
      <section className="bt-card" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
        <Avatar user={me?.user} size={64} />
        <div style={{ flex: '1 1 300px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Display name
            <Input defaultValue={me?.user.name} styles={{ root: { height: 38, padding: '0 12px' } }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Time zone
            <Select defaultValue="Europe/Malta" style={{ height: 38, padding: '0 12px' }} options={['Europe/Malta', 'Europe/London', 'UTC'].map((v) => ({ value: v, label: v }))} />
          </label>
        </div>
        <span style={{ flexBasis: '100%', fontSize: 12.5, color: color.muted }}>
          Signed in as {me?.user.email}. Name and photo come from your Google or Microsoft account unless you change them here. Saving profile fields is not wired yet.
        </span>
      </section>
      <section className="bt-card" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Notify me when</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 90px 90px 110px', gap: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
            <span /><span style={{ textAlign: 'center' }}>In app</span><span style={{ textAlign: 'center' }}>Email</span><span style={{ textAlign: 'center' }}>Google Chat</span>
          </div>
          {ROWS.map((label) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 90px 90px 110px', gap: 8, alignItems: 'center', minHeight: 44, padding: '0 16px', borderBottom: `1px solid ${color.divider}`, fontSize: 13.5 }}>
              <span>{label}</span>
              <span style={{ textAlign: 'center' }}><Checkbox defaultChecked /></span>
              <span style={{ textAlign: 'center' }}><Checkbox defaultChecked={label !== 'Daily digest is ready'} /></span>
              <span style={{ textAlign: 'center' }}><Checkbox disabled /></span>
            </div>
          ))}
          <div style={{ padding: '12px 16px', fontSize: 12.5, color: color.muted }}>Google Chat direct messages need the BornTask Chat app (v2). Until then this column is greyed out.</div>
        </div>
      </section>
      <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <span style={{ flex: '1 1 280px' }}>
          <span style={{ display: 'block', fontWeight: 600 }}>Daily digest email</span>
          <span style={{ fontSize: 13, color: color.muted }}>What's due and what mentions you, once a day instead of one email per event.</span>
        </span>
        <Select defaultValue="workdays" style={{ minWidth: 180, height: 38, padding: '0 12px' }} options={[
          { value: 'workdays', label: 'Workdays at 08:00' },
          { value: 'daily', label: 'Every day at 08:00' },
          { value: 'off', label: 'Off' },
        ]}
        />
      </section>
    </SettingsFrame>
  );
}
