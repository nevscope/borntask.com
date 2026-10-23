import { Alert, Button, Dropdown } from 'antd';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe, useProject, useProjectAccessRequests, useProjectTasks, useResolveAccessRequest } from '../api/queries';
import { useWorkspaceCatalog } from '../api/catalog';
import type { ProjectRole } from '../api/types';
import { Avatar, RemovableRoleChip } from '../components/Chips';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InvitePeopleButton } from '../components/InvitePeople';
import { SettingsFrame } from '../components/SettingsNav';
import { useStatusToast } from '../components/StatusToast';
import { statusById } from '../lib/workflow';
import { color } from '../theme/tokens';

const FALLBACK_ROLES: ProjectRole[] = ['lead', 'business', 'developer', 'tester', 'observer'];

type Invite = { id: string; email: string; tenantRole: string; expiresAt: string };

export function ProjectMembersScreen() {
  const sent = useStatusToast();
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const catalog = useWorkspaceCatalog();
  const roleOptions = catalog.roles.length
    ? catalog.roles.map((r) => ({ slug: r.slug, name: r.name }))
    : FALLBACK_ROLES.map((slug) => ({ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1) }));
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const detail = useProject(projectKey);
  const isLead = detail.data?.project.leadId === me?.user.id
    || Boolean(detail.data?.members.find((m) => m.userId === me?.user.id)?.roles.includes('lead'));
  const canReviewAccess = canAdmin || isLead;
  const tasks = useProjectTasks(projectKey).data;
  const [pendingRemove, setPendingRemove] = useState<{ userId: string; name: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; email: string } | null>(null);
  const qc = useQueryClient();
  const invites = useQuery({
    queryKey: ['invites', detail.data?.project.id],
    enabled: canAdmin && !!detail.data?.project.id,
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
    onError: () => sent.show({ kind: 'error', text: 'Could not update roles.' }),
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

  const actInvite = async (id: string, email: string, action: 'resend' | 'revoke') => {
    try {
      const res = await fetch(`${BASE_URL}/invites/${encodeURIComponent(id)}/${action}`, { method: 'POST', credentials: 'include' });
      const json = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) throw new Error(json.message ?? (action === 'resend' ? 'Could not resend the invitation' : 'Could not revoke the invitation'));
      void qc.invalidateQueries({ queryKey: ['invites', detail.data?.project.id] });
      if (action === 'resend') sent.show(`Invitation sent to ${email}`);
      if (action === 'revoke') setPendingRevoke(null);
    } catch (err) {
      sent.show({ kind: 'error', text: 'Could not resend the invitation.' });
    }
  };

  const rows = (detail.data?.members ?? []).map((m) => {
    const user = detail.data?.users.find((u) => u.id === m.userId);
    return { ...m, name: user?.name ?? m.userId, email: user?.email ?? '', user };
  });

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="bt-h1">Members</h1>
          <p style={{ color: color.muted, margin: '6px 0 0', fontSize: 13.5 }}>Project roles decide who can move tasks between stages.</p>
        </div>
        <InvitePeopleButton variant="primary" projectId={detail.data?.project.id} projectName={detail.data?.project.name} />
      </div>
      {detail.isError && <Alert type="error" message="Sign in and set VITE_MOCK_PROJECTS=false to edit live members." />}
      <section className="bt-card" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 680 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1.2fr) 110px 44px', gap: 12, padding: '10px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
            <span>Person</span><span>Project roles</span><span>Workspace role</span><span />
          </div>
          {rows.map((r) => (
            <div key={r.userId} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1.2fr) 110px 44px', gap: 12, alignItems: 'center', minHeight: 56, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar user={r.user} size={30} fontSize={11} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 500 }}>{r.name}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: color.muted }}>{r.email}</span>
                </span>
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {r.roles.map((role) => (
                  <RemovableRoleChip
                    key={role}
                    role={role}
                    removeLabel={`Remove ${role} from ${r.name}`}
                    onRemove={() => saveRoles.mutate({ userId: r.userId, roleSlugs: r.roles.filter((item) => item !== role) })}
                  />
                ))}
                <Dropdown
                  menu={{
                    items: roleOptions.filter((role) => !r.roles.includes(role.slug)).map((role) => ({
                      key: role.slug,
                      label: role.name,
                      onClick: () => saveRoles.mutate({ userId: r.userId, roleSlugs: [...r.roles, role.slug] }),
                    })),
                  }}
                >
                  <button type="button" style={{ height: 24, padding: '0 8px', border: `1px dashed ${color.dashed}`, borderRadius: 6, background: 'transparent', font: 'inherit', fontSize: 12, color: color.muted, cursor: 'pointer' }}>+ role</button>
                </Dropdown>
              </span>
              <span style={{ fontSize: 13, color: color.ink3 }}>{r.workspaceRole ?? 'Member'}</span>
              <Button type="text" aria-label={`Remove ${r.name}`} onClick={() => setPendingRemove({ userId: r.userId, name: r.name })}>x</Button>
            </div>
          ))}
        </div>
      </section>
      {canReviewAccess && <AccessRequestsCard projectKey={projectKey} />}
      {canAdmin && <section className="bt-card">
        <h2 style={{ margin: 0, padding: '14px 16px', fontSize: 15, fontWeight: 600, borderBottom: `1px solid ${color.divider}` }}>
          Pending invitations <span style={{ fontWeight: 500, color: color.muted }}>{invites.data?.length ?? 0}</span>
        </h2>
        {(invites.data ?? []).map((i) => {
          const expired = new Date(i.expiresAt).getTime() < Date.now();
          return (
            <div key={i.id} className="bt-row" style={{ padding: '12px 16px' }}>
              <span style={{ flex: '1 1 240px' }}>
                <span style={{ display: 'block', fontWeight: 500 }}>{i.email}</span>
                <span style={{ fontSize: 12.5, color: color.muted }}>{i.tenantRole}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: expired ? 600 : 400, color: expired ? color.danger : color.ink3 }}>
                {expired ? 'Expired' : `Expires ${i.expiresAt.slice(0, 10)}`}
              </span>
              <Button onClick={() => void actInvite(i.id, i.email, 'resend')}>Resend</Button>
              <Button type="link" danger onClick={() => setPendingRevoke({ id: i.id, email: i.email })}>Revoke</Button>
            </div>
          );
        })}
        {(invites.data ?? []).length === 0 && <p style={{ padding: '0 16px 16px', color: color.muted }}>None pending.</p>}
      </section>}
      <ConfirmDialog
        open={pendingRevoke !== null}
        title={pendingRevoke ? `Revoke the invitation for ${pendingRevoke.email}?` : 'Revoke this invitation?'}
        confirmLabel="Revoke"
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          if (!pendingRevoke) return;
          void actInvite(pendingRevoke.id, pendingRevoke.email, 'revoke');
        }}
      >
        The link stops working. You can invite them again later.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingRemove !== null}
        title={pendingRemove ? `Remove ${pendingRemove.name.split(' ')[0]} from ${detail.data?.project.name ?? 'this project'}?` : 'Remove this member?'}
        confirmLabel="Remove"
        busy={remove.isPending}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) return;
          remove.mutate(pendingRemove.userId, { onSuccess: () => setPendingRemove(null) });
        }}
      >
        {memberRemoveBody(openTaskCount(tasks, detail.data?.workflow, pendingRemove?.userId))}
      </ConfirmDialog>
    </SettingsFrame>
  );
}

function AccessRequestsCard({ projectKey }: { projectKey: string }) {
  const sent = useStatusToast();
  const requests = useProjectAccessRequests(projectKey, true);
  const resolve = useResolveAccessRequest(projectKey);
  const rows = requests.data ?? [];

  function act(id: string, action: 'accept' | 'decline') {
    resolve.mutate({ id, action }, {
      onSuccess: () => sent.show(action === 'accept' ? 'They can now open this project.' : 'Request declined.'),
      onError: (err) => sent.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update that request.' }),
    });
  }

  return (
    <section className="bt-card">
      <h2 style={{ margin: 0, padding: '14px 16px', fontSize: 15, fontWeight: 600, borderBottom: `1px solid ${color.divider}` }}>
        Access requests <span style={{ fontWeight: 500, color: color.muted }}>{rows.length}</span>
      </h2>
      {rows.map((row) => (
        <div key={row.id} className="bt-row" style={{ padding: '12px 16px' }}>
          <span style={{ flex: '1 1 240px' }}>
            <span style={{ display: 'block', fontWeight: 500 }}>{row.name}</span>
            <span style={{ fontSize: 12.5, color: color.muted }}>{row.email}</span>
          </span>
          <Button type="primary" loading={resolve.isPending && resolve.variables?.id === row.id && resolve.variables.action === 'accept'} onClick={() => act(row.id, 'accept')}>
            Accept
          </Button>
          <Button onClick={() => act(row.id, 'decline')} loading={resolve.isPending && resolve.variables?.id === row.id && resolve.variables.action === 'decline'}>
            Decline
          </Button>
        </div>
      ))}
      {rows.length === 0 && <p style={{ padding: '0 16px 16px', color: color.muted }}>None pending.</p>}
    </section>
  );
}

function openTaskCount(tasks: { assigneeId: string | null; statusId: string }[] | undefined, workflow: Parameters<typeof statusById>[0] | undefined, userId: string | undefined) {
  if (!tasks || !workflow || !userId) return null;
  return tasks.filter((task) => task.assigneeId === userId && statusById(workflow, task.statusId)?.category !== 'done').length;
}

function memberRemoveBody(count: number | null) {
  if (count === null) return 'Their open tasks become unassigned. Their comments and history stay.';
  if (count === 0) return 'They have no open tasks. Their comments and history stay.';
  if (count === 1) return 'Their 1 open task becomes unassigned. Their comments and history stay.';
  return `Their ${count} open tasks become unassigned. Their comments and history stay.`;
}
