import { Alert, Button, Input, Select } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import type { User, WorkspaceRole } from '../api/types';
import { Avatar } from '../components/Chips';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InvitePeopleButton } from '../components/InvitePeople';
import { SettingsFrame } from '../components/SettingsNav';
import { useStatusToast } from '../components/StatusToast';
import { color } from '../theme/tokens';

type Person = User & { workspaceRole: WorkspaceRole; signsInWith?: string; projects?: string };
type Invite = { id: string; email: string; tenantRole: string; expiresAt: string };

function domainsOf(raw: unknown, email?: string): string[] {
  if (Array.isArray(raw)) return raw.filter((d): d is string => typeof d === 'string');
  const fromEmail = email?.split('@')[1];
  return fromEmail ? [fromEmail] : [];
}

export function AdminPeopleScreen() {
  const sent = useStatusToast();
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; email: string } | null>(null);
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
  const liveDomains = domains ?? domainsOf(ws.data?.allowedDomains, me?.user.email);

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

  const actInvite = async (id: string, email: string, action: 'resend' | 'revoke') => {
    try {
      const res = await fetch(`${BASE_URL}/invites/${encodeURIComponent(id)}/${action}`, { method: 'POST', credentials: 'include' });
      const json = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) throw new Error(json.message ?? (action === 'resend' ? 'Could not resend the invitation' : 'Could not revoke the invitation'));
      void qc.invalidateQueries({ queryKey: ['invites'] });
      if (action === 'resend') sent.show(`Invitation sent to ${email}`);
      if (action === 'revoke') setPendingRevoke(null);
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
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
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
      {!canAdmin && <Alert type="warning" message="You can view people. Only an owner or admin can change workspace roles." />}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.4fr) 130px 120px minmax(110px, 1fr)', gap: 12, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
            <span>Person</span><span>Workspace role</span><span>Signs in with</span><span>Projects</span>
          </div>
          {rows.map((p) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.4fr) 130px 120px minmax(110px, 1fr)', gap: 12, alignItems: 'center', minHeight: 54, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
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
                options={[
                  { value: 'owner', label: 'Owner' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'member', label: 'Member' },
                  { value: 'guest', label: 'Guest' },
                  { value: 'viewer', label: 'Viewer' },
                ]}
                onChange={(tenantRole) => setRole.mutate({ userId: p.id, tenantRole })}
              />
              <span style={{ fontSize: 13, color: color.ink3 }}>{p.signsInWith ?? '-'}</span>
              <span style={{ fontSize: 13, color: color.ink3 }}>{p.projects ?? '-'}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="bt-card">
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
              <Button type="link" danger onClick={() => setPendingRevoke({ id: i.id, email: i.email })}>Revoke</Button>
            </div>
          );
        })}
        {(invites.data ?? []).length === 0 && <p style={{ padding: '0 16px 16px', color: color.muted }}>None pending.</p>}
      </section>
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
