import { Alert, Button, Select, Table } from 'antd';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe, useProject } from '../api/queries';
import type { ProjectRole } from '../api/types';
import { InvitePeopleButton } from '../components/InvitePeople';
import { SettingsFrame } from '../components/SettingsNav';
import { color } from '../theme/tokens';

const ROLE_OPTS = [
  { value: 'lead', label: 'Lead' },
  { value: 'business', label: 'Business' },
  { value: 'developer', label: 'Developer' },
  { value: 'tester', label: 'Tester' },
  { value: 'observer', label: 'Observer' },
];

type Invite = { id: string; email: string; tenantRole: string; expiresAt: string };

export function ProjectMembersScreen() {
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const detail = useProject(projectKey);
  const qc = useQueryClient();
  const invites = useQuery({
    queryKey: ['invites', detail.data?.project.id],
    enabled: !!detail.data?.project.id,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/invites?projectId=${encodeURIComponent(detail.data!.project.id)}`, { credentials: 'include' });
      const json = await res.json() as { invites?: Invite[] };
      return json.invites ?? [];
    },
  });

  const saveRoles = useMutation({
    mutationFn: async ({ userId, roleSlugs }: { userId: string; roleSlugs: ProjectRole[] }) => {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleSlugs }),
      });
      if (!res.ok) throw new Error('Could not update roles');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.project(projectKey) }),
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Could not remove');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.project(projectKey) }),
  });

  const actInvite = async (id: string, action: 'resend' | 'revoke') => {
    await fetch(`${BASE_URL}/invites/${encodeURIComponent(id)}/${action}`, { method: 'POST', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['invites', detail.data?.project.id] });
  };

  const rows = (detail.data?.members ?? []).map((m) => {
    const user = detail.data?.users.find((u) => u.id === m.userId);
    return { ...m, name: user?.name ?? m.userId, email: user?.email ?? '' };
  });

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="bt-h1">Members</h1>
          <p style={{ color: color.muted, margin: '6px 0 0' }}>{detail.data?.project.name ?? projectKey}</p>
        </div>
        <InvitePeopleButton projectId={detail.data?.project.id} projectName={detail.data?.project.name} />
      </div>
      {detail.isError && <Alert type="error" message="Sign in and set VITE_MOCK_PROJECTS=false to edit live members." />}
      <Table
        rowKey="userId"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: 'Person', render: (_, r) => <span><strong>{r.name}</strong><br /><span style={{ color: color.muted }}>{r.email}</span></span> },
          {
            title: 'Roles',
            render: (_, r) => (
              <Select
                mode="multiple"
                style={{ minWidth: 220 }}
                value={r.roles}
                options={ROLE_OPTS}
                onChange={(roleSlugs) => saveRoles.mutate({ userId: r.userId, roleSlugs: roleSlugs as ProjectRole[] })}
              />
            ),
          },
          {
            title: '',
            width: 90,
            render: (_, r) => (
              <Button type="link" danger onClick={() => remove.mutate(r.userId)}>Remove</Button>
            ),
          },
        ]}
      />
      <section className="bt-card">
        <h2 style={{ margin: 0, padding: 16, fontSize: 15 }}>Pending invitations</h2>
        {(invites.data ?? []).length === 0 && <p style={{ padding: '0 16px 16px', color: color.muted }}>None pending.</p>}
        {(invites.data ?? []).map((i) => (
          <div key={i.id} className="bt-row">
            <span style={{ flex: 1 }}>{i.email}<br /><span style={{ color: color.muted, fontSize: 12.5 }}>{i.tenantRole} · expires {i.expiresAt.slice(0, 10)}</span></span>
            <Button onClick={() => void actInvite(i.id, 'resend')}>Resend</Button>
            <Button type="link" danger onClick={() => void actInvite(i.id, 'revoke')}>Revoke</Button>
          </div>
        ))}
      </section>
    </SettingsFrame>
  );
}
