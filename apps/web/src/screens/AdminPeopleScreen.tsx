import { Alert, Button, Input, Select, Table } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import type { User, WorkspaceRole } from '../api/types';
import { InvitePeopleButton } from '../components/InvitePeople';
import { SettingsFrame } from '../components/SettingsNav';
import { color } from '../theme/tokens';

type Person = User & { workspaceRole: WorkspaceRole };
type Invite = { id: string; email: string; tenantRole: string; expiresAt: string };

export function AdminPeopleScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const people = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/people`, { credentials: 'include' });
      if (!res.ok) return [] as Person[];
      return (await res.json()) as Person[];
    },
  });
  const invites = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/invites`, { credentials: 'include' });
      const json = await res.json() as { invites?: Invite[]; message?: string };
      if (!res.ok) return [] as Invite[];
      return json.invites ?? [];
    },
  });
  const setRole = useMutation({
    mutationFn: async ({ userId, tenantRole }: { userId: string; tenantRole: WorkspaceRole }) => {
      const res = await fetch(`${BASE_URL}/people/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantRole }),
      });
      if (!res.ok) throw new Error('Could not change role');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['people'] }),
  });

  const rows = (people.data ?? []).filter((p) => {
    const n = q.trim().toLowerCase();
    if (!n) return true;
    return p.name.toLowerCase().includes(n) || p.email.toLowerCase().includes(n);
  });

  return (
    <SettingsFrame canAdmin={canAdmin}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="bt-h1">People and invitations</h1>
          <p style={{ color: color.muted, margin: '6px 0 0' }}>{me?.workspace.name} · {people.data?.length ?? 0} people</p>
        </div>
        <InvitePeopleButton />
      </div>
      {!canAdmin && <Alert type="warning" message="You can view people. Only an owner or admin can change workspace roles." />}
      <section className="bt-card">
        <div className="bt-group-head">
          <span style={{ flex: 1 }}>Members</span>
          <Input.Search allowClear placeholder="Find a person" onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
        </div>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: 'Person', render: (_, p) => <span><strong>{p.name}</strong><br /><span style={{ color: color.muted }}>{p.email}</span></span> },
            {
              title: 'Workspace role',
              render: (_, p) => (
                <Select
                  disabled={!canAdmin || p.workspaceRole === 'owner'}
                  value={p.workspaceRole}
                  style={{ width: 130 }}
                  options={[
                    { value: 'owner', label: 'Owner' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'member', label: 'Member' },
                    { value: 'guest', label: 'Guest' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                  onChange={(tenantRole) => setRole.mutate({ userId: p.id, tenantRole })}
                />
              ),
            },
          ]}
        />
      </section>
      <section className="bt-card">
        <h2 style={{ margin: 0, padding: 16, fontSize: 15 }}>Pending invitations</h2>
        {(invites.data ?? []).map((i) => (
          <div key={i.id} className="bt-row">
            <span style={{ flex: 1 }}>{i.email}<br /><span style={{ fontSize: 12.5, color: color.muted }}>{i.tenantRole}</span></span>
            <Button onClick={() => void fetch(`${BASE_URL}/invites/${i.id}/resend`, { method: 'POST', credentials: 'include' }).then(() => qc.invalidateQueries({ queryKey: ['invites'] }))}>Resend</Button>
            <Button type="link" danger onClick={() => void fetch(`${BASE_URL}/invites/${i.id}/revoke`, { method: 'POST', credentials: 'include' }).then(() => qc.invalidateQueries({ queryKey: ['invites'] }))}>Revoke</Button>
          </div>
        ))}
        {(invites.data ?? []).length === 0 && <p style={{ padding: '0 16px 16px', color: color.muted }}>None pending.</p>}
      </section>
    </SettingsFrame>
  );
}
