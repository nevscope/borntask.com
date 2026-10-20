import { Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { useMe, useProjects } from '../api/queries';
import { useWorkspaceCatalog } from '../api/catalog';
import type { ProjectRole } from '../api/types';
import { RoleTag } from './Chips';
import { inviteSentText, useStatusToast } from './StatusToast';
import { categoryBar, color, font, radius, roleStyle } from '../theme/tokens';

const FALLBACK_ROLES: ProjectRole[] = ['business', 'developer', 'tester', 'observer'];

function emailDomain(email: string) {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

function parseEmails(raw: string): string[] {
  return raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'));
}

function PlusIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function InvitePeopleButton({
  projectId,
  projectName,
  variant = 'icon',
}: {
  projectId?: string;
  projectName?: string;
  variant?: 'icon' | 'primary';
}) {
  const sent = useStatusToast();
  const qc = useQueryClient();
  const me = useMe().data;
  const catalog = useWorkspaceCatalog();
  const PROJECT_ROLES = (catalog.roles.filter((r) => r.slug !== 'lead').map((r) => r.slug)).length
    ? catalog.roles.filter((r) => r.slug !== 'lead').map((r) => r.slug)
    : FALLBACK_ROLES;
  const projects = useProjects().data ?? [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [tenantRole, setTenantRole] = useState<'member' | 'admin' | 'viewer'>('member');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId ?? '');
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>(['developer']);
  const [note, setNote] = useState('');

  const ownDomain = me?.user.email ? emailDomain(me.user.email) : '';
  const guests = emails.filter((e) => ownDomain && emailDomain(e) !== ownDomain);

  useEffect(() => {
    if (!open) return;
    setEmails([]);
    setDraft('');
    setTenantRole('member');
    setSelectedProjectId(projectId ?? '');
    setProjectRoles(['developer']);
    setNote('');
  }, [open, projectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const count = emails.length;
  const sendLabel = count === 0 ? 'Send invitations' : count === 1 ? 'Send 1 invitation' : `Send ${count} invitations`;

  const canInvite = !!me && me.workspaceRole !== 'guest' && me.workspaceRole !== 'viewer';
  const guestBanner = guests.length > 0;

  function commitDraft() {
    const next = parseEmails(draft);
    if (next.length === 0) return;
    setEmails((prev) => [...new Set([...prev, ...next])]);
    setDraft('');
  }

  function toggleRole(role: ProjectRole) {
    setProjectRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function send() {
    commitDraft();
    const list = [...new Set([...emails, ...parseEmails(draft)])];
    if (list.length === 0) {
      sent.show({ kind: 'error', text: 'Add at least one email address.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BASE_URL}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: list,
          tenantRole,
          projectId: selectedProjectId || undefined,
          projectRoleSlugs: selectedProjectId ? projectRoles : undefined,
          message: note.trim() || undefined,
        }),
      });
      const json = await res.json() as { message?: string; invites?: { email: string; url: string; tenantRole: string }[] };
      if (!res.ok) throw new Error(json.message ?? 'Invite failed');
      void qc.invalidateQueries({ queryKey: ['invites'] });
      sent.show(inviteSentText(json.invites ?? []));
      setOpen(false);
    } catch (e) {
      sent.show({ kind: 'error', text: 'Could not send the invitation.' });
    } finally {
      setBusy(false);
    }
  }

  if (!canInvite) return null;

  return (
    <>
      {variant === 'primary' ? (
        <button type="button" onClick={() => setOpen(true)} style={primaryBtn}>
          <PlusIcon />
          Invite people
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Invite people${projectName ? ` to ${projectName}` : ''}`}
          title="Invite people"
          onClick={() => setOpen(true)}
          style={iconBtn}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
      <Modal
        open={open}
        title={null}
        footer={null}
        closable={false}
        width={560}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        styles={{ container: { borderRadius: radius.xl, padding: 0, overflow: 'hidden' }, body: { padding: 0 } }}
      >
        <div role="dialog" aria-label="Invite people">
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${color.divider}`, fontFamily: font.display, fontSize: 17, fontWeight: 600 }}>
            Invite people
          </div>
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              Email addresses
              <span
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  minHeight: 42,
                  alignItems: 'center',
                  padding: '4px 8px',
                  border: `1px solid ${focused ? color.brand : color.border}`,
                  borderRadius: radius.md,
                  boxShadow: focused ? `0 0 0 3px ${color.brandTint}` : 'none',
                  background: color.surface,
                }}
              >
                {emails.map((email) => {
                  const guest = ownDomain !== '' && emailDomain(email) !== ownDomain;
                  return (
                    <span
                      key={email}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        height: 28,
                        padding: '0 4px 0 10px',
                        borderRadius: radius.sm,
                        background: guest ? roleStyle.tester.bg : color.chip,
                        color: guest ? color.warning : color.ink,
                        fontSize: 13,
                        fontWeight: 400,
                      }}
                    >
                      {email}{guest ? ' · guest' : ''}
                      <button
                        type="button"
                        aria-label={`Remove ${email}`}
                        onClick={() => setEmails(emails.filter((e) => e !== email))}
                        style={{ border: 0, background: 'transparent', color: guest ? color.warning : color.muted, cursor: 'pointer', padding: '0 4px', fontSize: 14, lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
                <input
                  type="text"
                  aria-label="Add another email"
                  placeholder="Add more, separated by commas"
                  value={draft}
                  onFocus={() => setFocused(true)}
                  onBlur={() => { setFocused(false); commitDraft(); }}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      commitDraft();
                    }
                    if (e.key === 'Backspace' && draft === '' && emails.length > 0) {
                      setEmails(emails.slice(0, -1));
                    }
                  }}
                  style={{ flex: '1 1 160px', border: 0, font: 'inherit', fontSize: 13.5, fontWeight: 400, outline: 'none', background: 'transparent', minWidth: 120 }}
                />
              </span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
                Workspace role
                <Select
                  value={tenantRole}
                  onChange={setTenantRole}
                  options={[
                    { value: 'member', label: 'Member' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                  style={{ height: 38 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
                Add to project
                <Select
                  value={selectedProjectId || '__none'}
                  onChange={(v) => setSelectedProjectId(v === '__none' ? '' : v)}
                  options={[
                    { value: '__none', label: 'No project' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  style={{ height: 38 }}
                />
              </label>
            </div>
            {selectedProjectId ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Project roles</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PROJECT_ROLES.map((role) => {
                    const pressed = projectRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={pressed}
                        onClick={() => toggleRole(role)}
                        style={{
                          height: 30,
                          padding: '0 8px',
                          border: `1px solid ${pressed ? color.brand : color.border}`,
                          borderRadius: 7,
                          background: pressed ? color.brandTint : color.surface,
                          font: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <RoleTag role={role} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {guestBanner ? (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: color.warningTint, border: `1px solid ${color.warningBorder}`, fontSize: 13, lineHeight: 1.45, color: color.warning }}>
                {guests.join(', ')} {guests.length === 1 ? 'is' : 'are'} outside your domain, so {guests.length === 1 ? 'it joins' : 'they join'} as a <strong>Guest</strong>: {selectedProject ? `${selectedProject.name} only` : 'invited projects only'}, no member directory.
              </div>
            ) : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              <span>Message <span style={{ fontWeight: 400, color: color.muted }}>(optional, shown in the email)</span></span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ padding: '10px 12px', border: `1px solid ${color.border}`, borderRadius: radius.md, font: 'inherit', fontSize: 13.5, fontWeight: 400, resize: 'vertical' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: `1px solid ${color.divider}` }}>
            <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>Invitations expire after 7 days</span>
            <button type="button" onClick={() => setOpen(false)} style={ghostBtn}>Cancel</button>
            <button type="button" onClick={() => void send()} disabled={busy || count === 0 && draft.trim() === ''} style={sendBtn}>
              {busy ? 'Sending…' : sendLabel}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 38,
  padding: '0 14px',
  border: 0,
  borderRadius: radius.md,
  background: color.brand,
  color: color.surface,
  font: 'inherit',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const iconBtn = {
  width: 30,
  height: 30,
  marginLeft: 6,
  boxSizing: 'border-box' as const,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  border: `1.5px dashed ${categoryBar.backlog}`,
  background: color.surface,
  color: color.ink3,
  cursor: 'pointer',
};

const ghostBtn = {
  height: 36,
  padding: '0 14px',
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  background: color.surface,
  font: 'inherit',
  fontSize: 13,
  color: color.ink,
  cursor: 'pointer',
} as const;

const sendBtn = {
  height: 36,
  padding: '0 14px',
  border: 0,
  borderRadius: radius.md,
  background: color.brand,
  color: color.surface,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
} as const;
