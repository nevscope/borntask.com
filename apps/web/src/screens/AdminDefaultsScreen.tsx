import { Alert, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import type { Workflow } from '../api/types';
import { SettingsFrame } from '../components/SettingsNav';
import { color } from '../theme/tokens';

type Defaults = {
  roles: { id: string; name: string; slug: string; colour: string }[];
  types: { id: string; name: string; slug: string; colour: string; template: string | null }[];
  workflows: Workflow[];
};

export function AdminDefaultsScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const data = useQuery({
    queryKey: ['admin-defaults'],
    enabled: canAdmin,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/admin/defaults`, { credentials: 'include' });
      if (!res.ok) throw new Error('Owners and admins only.');
      return (await res.json()) as Defaults;
    },
  });

  return (
    <SettingsFrame canAdmin={canAdmin}>
      <h1 className="bt-h1">Roles, types and workflows</h1>
      <p style={{ color: color.muted }}>Owner and admin only. Edit transitions in the workflow editor.</p>
      {!canAdmin && <Alert type="warning" message="Only an owner or admin can open workspace defaults." />}
      {data.error && <Alert type="error" message={data.error.message} />}
      <section className="bt-card">
        <div className="bt-group-head">Project roles</div>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={data.data?.roles ?? []}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Slug', dataIndex: 'slug' },
          ]}
        />
      </section>
      <section className="bt-card">
        <div className="bt-group-head">Task types</div>
        {(data.data?.types ?? []).map((t) => (
          <div key={t.id} className="bt-row">
            <span style={{ fontWeight: 500 }}>{t.name}</span>
            <span style={{ flex: 1, color: color.muted, fontSize: 12.5 }}>{t.template ?? 'No template'}</span>
          </div>
        ))}
      </section>
      <section className="bt-card">
        <div className="bt-group-head">
          <span style={{ flex: 1 }}>Workflows</span>
          <Link to="/settings/workflow">Open editor</Link>
        </div>
        {(data.data?.workflows ?? []).map((w) => (
          <div key={w.id} className="bt-row">
            <span style={{ fontWeight: 500 }}>{w.name}</span>
            <span style={{ color: color.muted }}>{w.statuses.length} statuses · {w.transitions.length} transitions</span>
          </div>
        ))}
      </section>
    </SettingsFrame>
  );
}
