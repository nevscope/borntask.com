import { Alert, Button, Input, Select } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe } from '../api/queries';
import type { User, WorkspaceRole } from '../api/types';
import { Avatar } from '../components/Chips';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InvitePeopleButton } from '../components/InvitePeople';
import { SettingsFrame } from '../components/SettingsNav';
import { useStatusToast } from '../components/StatusToast';
import { WorkspaceRolesAside } from '../components/WorkspaceRolesAside';
import { color } from '../theme/tokens';

const NON_OWNER_ROLES: { value: WorkspaceRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'guest', label: 'Guest' },
  { value: 'viewer', label: 'Viewer' },
];

type Person = User & { workspaceRole: WorkspaceRole; signsInWith?: string; projects?: string };
type Invite = { id: string; email: string; tenantRole: string; expiresAt: string };

function storedDomains(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0);
}

export function AdminPeopleScreen() {
  const sent = useStatusToast();
  const me = useMe().data;
  const isOwner = me?.workspaceRole === 'owner';
  const canAdmin = isOwner || me?.workspaceRole === 'admin';
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [pendingInviteRevoke, setPendingInviteRevoke] = useState<{ id: string; email: string } | null>(null);
  const [pendingPersonRevoke, setPendingPersonRevoke] = useState<Person | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<Person | null>(null);
  const [transferConfirm, setTransferConfirm] = useState('');
  const [pendingDomain, setPendingDomain] = useState<string | null>(null);
  const [domainDraft, setDomainDraft] = useState('');
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
    enabled: canAdmin,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/invites`, { credentials: 'include' });
      const json = await res.json() as { invites?: Invite[] };
      if (!res.ok) return [] as Invite[];
      return json.invites ?? [];
    },
  });
  const ws = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/workspace`, { credentials: 'include' });
      if (!res.ok) return { allowedDomains: [] as unknown };
      return (await res.json()) as { allowedDomains: unknown };
    },
  });
  const [domains, setDomains] = useState<string[] | null>(null);
  const liveDomains = domains ?? storedDomains(ws.data?.allowedDomains);
  const domainsKnown = domains !== null || ws.isSuccess;

  const setRole = useMutation({
    mutationFn: async ({ userId, tenantRole }: { userId: string; tenantRole: WorkspaceRole }) => {
      const res = await fetch(`${BASE_URL}/people/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantRole }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
        throw new Error(json.error?.message ?? json.message ?? 'Could not change role');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['people'] });
      void qc.invalidateQueries({ queryKey: qk.me });
      setPendingTransfer(null);
      setTransferConfirm('');
    },
    onError: (err) => sent.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not change role.' }),
  });

  const revokePerson = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`${BASE_URL}/people/${encodeURIComponent(userId)}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
        throw new Error(json.error?.message ?? json.message ?? 'Could not revoke access');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['people'] });
      void qc.invalidateQueries({ queryKey: ['invites'] });
      void qc.invalidateQueries({ queryKey: qk.projects });
      setPendingPersonRevoke(null);
      sent.show('Access revoked.');
    },
    onError: (err) => sent.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not revoke access.' }),
  });

  const actInvite = async (id: string, email: string, action: 'resend' | 'revoke') => {
    try {
      const res = await fetch(`${BASE_URL}/invites/${encodeURIComponent(id)}/${action}`, { method: 'POST', credentials: 'include' });
      const json = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) throw new Error(json.message ?? (action === 'resend' ? 'Could not resend the invitation' : 'Could not revoke the invitation'));
      void qc.invalidateQueries({ queryKey: ['invites'] });
      if (action === 'resend') sent.show(`Invitation sent to ${email}`);
      if (action === 'revoke') setPendingInviteRevoke(null);
    } catch (err) {
      sent.show({ kind: 'error', text: 'Could not resend the invitation.' });
    }
  };

  const saveDomains = async (next: string[]) => {
    setDomains(next);
    await fetch(`${BASE_URL}/workspace`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowedDomains: next }),
    });
    void qc.invalidateQueries({ queryKey: ['workspace-settings'] });
  };

  const rows = (people.data ?? []).filter((p) => {
    const n = q.trim().toLowerCase();
    if (!n) return true;
    return p.name.toLowerCase().includes(n) || p.email.toLowerCase().includes(n);
  });
  const members = (people.data ?? []).filter((p) => p.workspaceRole !== 'guest').length;
  const guests = (people.data ?? []).filter((p) => p.workspaceRole === 'guest').length;

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={isOwner}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="bt-h1">People and invitations</h1>
          <p style={{ color: color.muted, margin: '6px 0 0' }}>
            {me?.workspace.name}
            {people.data ? ` · ${members} ${members === 1 ? 'member' : 'members'} · ${guests} ${guests === 1 ? 'guest' : 'guests'}` : ''}
          </p>
        </div>
        <InvitePeopleButton variant="primary" />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20 }}>
      <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!canAdmin && <Alert type="warning" message="You can view people. Only an owner or admin can change workspace roles." />}
      {canAdmin && !isOwner && <Alert type="info" message="Admins can change member, guest, viewer and admin roles. Only the workspace owner can transfer ownership." />}
      <section className="bt-card" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: '1 1 260px' }}>
          <span style={{ display: 'block', fontWeight: 600 }}>Sign-in</span>
          <span style={{ fontSize: 13, color: color.muted }}>People sign in with Google or Microsoft. Your own domain joins without an invitation.</span>
        </span>
        {liveDomains.map((d) => (
          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 6px 0 10px', borderRadius: 8, background: color.chip, fontSize: 13 }}>
            {d}
            {canAdmin && (
              <button type="button" aria-label={`Remove ${d}`} onClick={() => setPendingDomain(d)} style={{ width: 22, height: 22, border: 0, borderRadius: 5, background: 'transparent', cursor: 'pointer' }}>x</button>
            )}
          </span>
        ))}
        {domainsKnown && liveDomains.length === 0 && (
          <span style={{ fontSize: 13, color: color.muted }}>No sign-in domain is saved yet.</span>
        )}
        {canAdmin && (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <Input value={domainDraft} onChange={(e) => setDomainDraft(e.target.value)} placeholder="company.com" style={{ width: 140, height: 32 }} />
            <Button
              onClick={() => {
                const next = domainDraft.trim().toLowerCase();
                if (!next || liveDomains.includes(next)) return;
                setDomainDraft('');
                void saveDomains([...liveDomains, next]);
              }}
            >
              + Add domain
            </Button>
          </span>
        )}
      </section>
      <section className="bt-card" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${color.divider}` }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Members</h2>
          <Input.Search
            allowClear
            placeholder="Find a person"
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 200 }}
            styles={{ root: { height: 34, fontSize: 13 }, input: { fontSize: 13 } }}
          />
        </div>
        <div style={{ minWidth: 720 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.4fr) 130px 120px minmax(110px, 1fr) 88px', gap: 12, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
            <span>Person</span><span>Workspace role</span><span>Signs in with</span><span>Projects</span><span />
          </div>
          {rows.map((p) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.4fr) 130px 120px minmax(110px, 1fr) 88px', gap: 12, alignItems: 'center', minHeight: 54, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar user={p} size={30} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 500 }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: color.muted }}>{p.email}</span>
                </span>
              </span>
              <Select
                disabled={!canAdmin || p.workspaceRole === 'owner'}
                value={p.workspaceRole}
                style={{ width: 130 }}
                options={
                  p.workspaceRole === 'owner'
                    ? [{ value: 'owner', label: 'Owner' }]
                    : isOwner && p.id !== me?.user.id && p.workspaceRole !== 'guest'
                      ? [{ value: 'owner', label: 'Owner' }, ...NON_OWNER_ROLES]
                      : NON_OWNER_ROLES
                }
                onChange={(tenantRole) => {
                  if (tenantRole === 'owner') {
                    setTransferConfirm('');
                    setPendingTransfer(p);
                    return;
                  }
                  setRole.mutate({ userId: p.id, tenantRole });
                }}
              />
              <span style={{ fontSize: 13, color: color.ink3 }}>{p.signsInWith ?? '-'}</span>
              <span style={{ fontSize: 13, color: color.ink3 }}>{p.projects ?? '-'}</span>
              {canAdmin && p.workspaceRole !== 'owner' && p.id !== me?.user.id && (isOwner || p.workspaceRole !== 'admin') ? (
                <Button type="link" danger onClick={() => setPendingPersonRevoke(p)}>Revoke</Button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      </section>
      {canAdmin && <section className="bt-card">
        <h2 style={{ margin: 0, padding: '14px 16px', fontSize: 15, fontWeight: 600, borderBottom: `1px solid ${color.divider}` }}>
          Pending invitations <span style={{ fontWeight: 500, color: color.muted }}>{invites.data?.length ?? 0}</span>
        </h2>
        {(invites.data ?? []).map((i) => {
          const expired = new Date(i.expiresAt).getTime() < Date.now();
          return (
            <div key={i.id} className="bt-row" style={{ padding: '12px 16px' }}>
              <span style={{ flex: '1 1 260px' }}>
                <span style={{ display: 'block', fontWeight: 500 }}>{i.email}</span>
                <span style={{ fontSize: 12.5, color: color.muted }}>{i.tenantRole}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: expired ? 600 : 400, color: expired ? color.danger : color.ink3 }}>
                {expired ? 'Expired' : `Expires ${i.expiresAt.slice(0, 10)}`}
              </span>
              <Button onClick={() => void actInvite(i.id, i.email, 'resend')}>Resend</Button>
              <Button type="link" danger onClick={() => setPendingInviteRevoke({ id: i.id, email: i.email })}>Revoke</Button>
            </div>
          );
        })}
        {(invites.data ?? []).length === 0 && <p style={{ padding: '0 16px 16px', color: color.muted }}>None pending.</p>}
      </section>}
      </div>
      <div style={{ flex: '1 1 240px', maxWidth: 300, width: '100%' }}>
        <WorkspaceRolesAside />
      </div>
      </div>
      <ConfirmDialog
        open={pendingInviteRevoke !== null}
        title={pendingInviteRevoke ? `Revoke the invitation for ${pendingInviteRevoke.email}?` : 'Revoke this invitation?'}
        confirmLabel="Revoke"
        onCancel={() => setPendingInviteRevoke(null)}
        onConfirm={() => {
          if (!pendingInviteRevoke) return;
          void actInvite(pendingInviteRevoke.id, pendingInviteRevoke.email, 'revoke');
        }}
      >
        The link stops working. You can invite them again later.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingPersonRevoke !== null}
        title={pendingPersonRevoke ? `Revoke access for ${pendingPersonRevoke.name}?` : 'Revoke access?'}
        confirmLabel="Revoke access"
        busy={revokePerson.isPending}
        onCancel={() => setPendingPersonRevoke(null)}
        onConfirm={() => {
          if (!pendingPersonRevoke) return;
          revokePerson.mutate(pendingPersonRevoke.id);
        }}
      >
        They lose this workspace and every project in it. You can invite them again later.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingTransfer !== null}
        title={pendingTransfer ? `Make ${pendingTransfer.name} the owner?` : 'Transfer ownership?'}
        confirmLabel="Transfer ownership"
        confirmDisabled={!pendingTransfer || transferConfirm.trim() !== pendingTransfer.name}
        busy={setRole.isPending}
        onCancel={() => {
          setPendingTransfer(null);
          setTransferConfirm('');
        }}
        onConfirm={() => {
          if (!pendingTransfer) return;
          setRole.mutate({ userId: pendingTransfer.id, tenantRole: 'owner' });
        }}
      >
        <p style={{ margin: '0 0 8px' }}>
          A workspace has one owner. After this, <strong>{pendingTransfer?.name}</strong> will own {me?.workspace.name}. You will become an admin.
        </p>
        <p style={{ margin: '0 0 8px' }}>
          The new owner can change billing, delete the workspace, manage people, and transfer ownership again. You cannot take ownership back yourself.
        </p>
        <p style={{ margin: '0 0 8px' }}>Type <strong>{pendingTransfer?.name}</strong> to confirm.</p>
        <Input
          value={transferConfirm}
          onChange={(e) => setTransferConfirm(e.target.value)}
          aria-label="New owner name"
          autoComplete="off"
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingDomain !== null}
        title={pendingDomain ? `Remove ${pendingDomain}?` : 'Remove this domain?'}
        confirmLabel="Remove"
        onCancel={() => setPendingDomain(null)}
        onConfirm={() => {
          if (!pendingDomain) return;
          const domain = pendingDomain;
          setPendingDomain(null);
          void saveDomains(liveDomains.filter((x) => x !== domain));
        }}
      >
        People on this domain will need an invitation to join.
      </ConfirmDialog>
    </SettingsFrame>
  );
}
