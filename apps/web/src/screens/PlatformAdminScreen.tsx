import { Alert, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMe, usePlatformWorkspaces } from '../api/queries';
import type { PlatformWorkspace } from '../api/types';
import { NoAccess } from '../components/NoAccess';
import { SettingsFrame } from '../components/SettingsNav';
import { color } from '../theme/tokens';

function formatWhen(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: color.muted }}>{label}</div>
      <div style={{ fontSize: 13, color: color.ink }}>{value}</div>
    </div>
  );
}

export function PlatformAdminScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const canSeePeople = me?.workspaceRole !== 'guest' && me?.workspaceRole !== 'viewer';
  const allowed = Boolean(me?.isPlatformAdmin);
  const list = usePlatformWorkspaces(allowed);

  const columns: ColumnsType<PlatformWorkspace> = [
    {
      title: 'Workspace',
      dataIndex: 'name',
      render: (_value, row) => (
        <span>
          <span style={{ display: 'block', fontWeight: 600 }}>{row.name}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: color.muted }}>{row.slug}</span>
        </span>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => formatWhen(value),
    },
    {
      title: 'Owner',
      render: (_value, row) => (
        <span>
          <span style={{ display: 'block' }}>{row.ownerName ?? 'No owner'}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: color.muted }}>{row.ownerEmail ?? '—'}</span>
        </span>
      ),
    },
    { title: 'People', dataIndex: 'memberCount', width: 80, align: 'right' },
    { title: 'Open tasks', dataIndex: 'openTaskCount', width: 100, align: 'right' },
    {
      title: 'Last activity',
      dataIndex: 'lastActivityAt',
      width: 170,
      render: (value: string | null) => formatWhen(value),
    },
  ];

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'} canSeePeople={canSeePeople}>
      {me && !allowed ? (
        <NoAccess kind="settings" message="This page is only for BornTask support." />
      ) : (
        <>
          <h1 className="bt-h1">Admin</h1>
          <p style={{ color: color.muted, margin: '6px 0 0' }}>
            Workspaces on this BornTask instance. Use this when someone needs support. You cannot open their session from here.
          </p>
          {list.isError && <Alert type="error" message={list.error instanceof Error ? list.error.message : 'Could not load workspaces.'} />}
          <section className="bt-card" style={{ overflowX: 'auto' }}>
            <Table<PlatformWorkspace>
              rowKey="id"
              loading={list.isLoading}
              dataSource={list.data ?? []}
              columns={columns}
              pagination={false}
              expandable={{
                expandedRowRender: (row) => (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '4px 0' }}>
                    <Detail label="Address" value={row.url} />
                    <Detail label="Workspace id" value={row.id} />
                    <Detail label="Updated" value={formatWhen(row.updatedAt)} />
                    <Detail
                      label="Roles"
                      value={`${row.roleCounts.owner} owner, ${row.roleCounts.admin} admin, ${row.roleCounts.member} member, ${row.roleCounts.guest} guest, ${row.roleCounts.viewer} viewer`}
                    />
                    <Detail label="Projects" value={String(row.projectCount)} />
                    <Detail label="Tasks (not in trash)" value={String(row.taskCount)} />
                    <Detail label="Pending invitations" value={String(row.invitationCount)} />
                    <Detail
                      label="Last import"
                      value={row.lastImport ? `${row.lastImport.status} · ${row.lastImport.fileName} · ${formatWhen(row.lastImport.createdAt)}` : 'None'}
                    />
                    <Detail label="Internal" value={yesNo(row.isInternal)} />
                    <Detail label="Google sign-in" value={yesNo(row.allowGoogle)} />
                    <Detail label="Microsoft sign-in" value={yesNo(row.allowMicrosoft)} />
                    <Detail label="Allowed domains" value={row.allowedDomains.length ? row.allowedDomains.join(', ') : 'None'} />
                  </div>
                ),
              }}
            />
          </section>
        </>
      )}
    </SettingsFrame>
  );
}
