import { suggestProjectKey, normaliseProjectKey } from '@borntask/shared';
import { Button, Input, Select } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe, useProjects } from '../api/queries';
import type { ProjectRole, User, WorkspaceRole } from '../api/types';
import { useWorkspaceCatalog } from '../api/catalog';
import { RoleTag } from '../components/Chips';
import { EmailSuggestField } from '../components/InvitePeople';
import { ProjectColourField } from '../components/ProjectColourField';
import { color, font, parseProjectHex, projectSwatches, radius } from '../theme/tokens';
import { ProjectsScreen } from './ProjectsScreen';

type Person = User & { workspaceRole: WorkspaceRole };

function randomProjectColour(): string {
  const pick = projectSwatches[Math.floor(Math.random() * projectSwatches.length)];
  return pick?.hex ?? projectSwatches[0]!.hex;
}

export function CreateProjectScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe().data;
  const takenKeys = (useProjects().data ?? []).map((project) => project.key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [colour, setColour] = useState<string>(() => randomProjectColour());
  const [hexDraft, setHexDraft] = useState(colour);
  const [workflow, setWorkflow] = useState<'delivery' | 'simple'>('delivery');
  const [sections, setSections] = useState<string[]>(['Inbox']);
  const [sectionDraft, setSectionDraft] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [picked, setPicked] = useState<{ userId: string; roles: ProjectRole[] }[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('business');
  const [pendingInvites, setPendingInvites] = useState<{ email: string; role: ProjectRole }[]>([]);
  const catalog = useWorkspaceCatalog();
  const roleChoices = (catalog.roles.filter((r) => r.slug !== 'lead').length
    ? catalog.roles.filter((r) => r.slug !== 'lead')
    : [
      { slug: 'business' as ProjectRole, name: 'Business' },
      { slug: 'developer' as ProjectRole, name: 'Developer' },
      { slug: 'tester' as ProjectRole, name: 'Tester' },
      { slug: 'observer' as ProjectRole, name: 'Observer' },
    ]);

  const people = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/people`, { credentials: 'include' });
      if (!res.ok) return [] as Person[];
      return (await res.json()) as Person[];
    },
  });

  const typedKey = normaliseProjectKey(key);
  const derivedKey = keyTouched && typedKey.length === 3
    ? typedKey
    : suggestProjectKey(name || typedKey, takenKeys);
  const others = useMemo(
    () => (people.data ?? []).filter((p) => p.id !== me?.user.id),
    [people.data, me?.user.id],
  );

  const close = () => navigate('/projects');

  const addSection = () => {
    const next = sectionDraft.trim();
    if (!next || sections.includes(next)) return;
    setSections([...sections, next]);
    setSectionDraft('');
    setAddingSection(false);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError('Give the project a name.');
      return;
    }
    if (derivedKey.length !== 3) {
      setError('The key must be exactly 3 letters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/projects`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          key: derivedKey || undefined,
          colour: parseProjectHex(colour) ?? colour,
          workflow,
          sections,
          members: picked.map((m) => ({ userId: m.userId, roleSlugs: m.roles })),
        }),
      });
      const json = await res.json() as { message?: string; project?: { key: string; id?: string } };
      if (!res.ok) throw new Error(json.message ?? 'Could not create project');
      const createdKey = json.project?.key ?? derivedKey;
      const invites = [...pendingInvites];
      if (inviteEmail.trim()) invites.push({ email: inviteEmail.trim(), role: inviteRole });
      if (json.project?.id) {
        for (const invite of invites) {
          await fetch(`${BASE_URL}/invites`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              emails: [invite.email],
              tenantRole: 'guest',
              projectId: json.project.id,
              projectRoleSlugs: [invite.role],
            }),
          });
        }
      }
      void qc.invalidateQueries({ queryKey: qk.projects });
      navigate(`/p/${createdKey}/list`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ProjectsScreen />
      <div
        role="presentation"
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          overflow: 'auto',
          background: color.overlay,
        }}
      >
      <div
        role="dialog"
        aria-label="Create project"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: 'calc(100dvh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          margin: 'auto',
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.xl,
          boxShadow: color.shadow,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px', borderBottom: `1px solid ${color.divider}`, flex: 'none' }}>
          <h2 style={{ flex: 1, margin: 0, fontFamily: font.display, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>New project</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: color.ink3, cursor: 'pointer' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18, flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
          {error && <p style={{ margin: 0, color: color.danger }}>{error}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              Project name
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                style={{ height: 40 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              Key
              <Input
                value={derivedKey}
                maxLength={3}
                onChange={(e) => { setKeyTouched(true); setKey(normaliseProjectKey(e.target.value)); }}
                placeholder="HLP"
                style={{ height: 40, letterSpacing: '0.04em' }}
              />
              <span style={{ fontWeight: 400, color: color.muted }}>3 letters</span>
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <ProjectColourField
              colour={colour}
              hexDraft={hexDraft}
              onColour={setColour}
              onHexDraft={setHexDraft}
            />
            <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              Workflow
              <Select
                value={workflow}
                onChange={setWorkflow}
                options={[
                  { value: 'delivery', label: 'Delivery: Idea to Deployed, plus On hold and Rejected' },
                  { value: 'simple', label: 'Simple: To do, Doing, Done' },
                ]}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Sections</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {sections.map((s) => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 8, background: color.chip, fontSize: 13 }}>
                  {s}
                  <button
                    type="button"
                    aria-label={`Remove ${s}`}
                    onClick={() => setSections(sections.filter((x) => x !== s))}
                    style={{ border: 0, background: 'transparent', color: color.muted, cursor: 'pointer', padding: 0, font: 'inherit' }}
                  >
                    x
                  </button>
                </span>
              ))}
              {addingSection ? (
                <Input
                  autoFocus
                  value={sectionDraft}
                  onChange={(e) => setSectionDraft(e.target.value)}
                  onPressEnter={addSection}
                  onBlur={addSection}
                  placeholder="Section name"
                  style={{ width: 160, height: 30 }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingSection(true)}
                  style={{ height: 30, padding: '0 10px', border: `1px dashed ${color.dashed}`, borderRadius: 8, background: 'transparent', font: 'inherit', fontSize: 13, color: color.muted, cursor: 'pointer' }}
                >
                  + Section
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Members and project roles</span>
            <div style={{ border: `1px solid ${color.border}`, borderRadius: 10 }}>
              {me && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                  <span style={{ flex: '1 1 140px' }}>{me.user.name}</span>
                  <RoleTag role="lead" />
                </div>
              )}
              {picked.map((m) => {
                const person = others.find((p) => p.id === m.userId);
                return (
                  <div key={m.userId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: `1px solid ${color.divider}` }}>
                    <span style={{ flex: '1 1 140px' }}>{person?.name ?? m.userId}</span>
                    {m.roles.map((role) => <RoleTag key={role} role={role} />)}
                    <Select<ProjectRole>
                      placeholder="+ role"
                      style={{ width: 140 }}
                      value={undefined}
                      options={roleChoices.filter((r) => !m.roles.includes(r.slug as ProjectRole)).map((r) => ({ value: r.slug as ProjectRole, label: r.name }))}
                      onChange={(role) => setPicked(picked.map((x) => x.userId === m.userId ? { ...x, roles: [...x.roles, role] } : x))}
                    />
                  </div>
                );
              })}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: `1px solid ${color.divider}`, background: color.subtle, borderRadius: '0 0 10px 10px' }}>
                <Select<string>
                  placeholder="Add a person already in the workspace"
                  style={{ flex: '1 1 220px' }}
                  value={undefined}
                  options={others.filter((p) => !picked.some((m) => m.userId === p.id)).map((p) => ({ value: p.id, label: `${p.name} (${p.email})` }))}
                  onChange={(userId) => setPicked([...picked, { userId, roles: ['developer'] }])}
                />
                <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                  <EmailSuggestField
                    emails={pendingInvites.map((row) => row.email)}
                    draft={inviteEmail}
                    people={others}
                    placeholder="Invite by email"
                    ownDomain={me?.user.email ? me.user.email.slice(me.user.email.lastIndexOf('@') + 1).toLowerCase() : undefined}
                    onDraft={setInviteEmail}
                    onEmails={(next) => {
                      setPendingInvites(next.map((email) => pendingInvites.find((row) => row.email === email) ?? { email, role: inviteRole }));
                    }}
                  />
                </div>
                <Select
                  value={inviteRole}
                  onChange={setInviteRole}
                  style={{ width: 130 }}
                  options={roleChoices.map((r) => ({ value: r.slug as ProjectRole, label: r.name }))}
                />
                {pendingInvites.map((row) => (
                  <span key={row.email} style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    {row.email}
                    <RoleTag role={row.role} />
                  </span>
                ))}
                <span style={{ flexBasis: '100%', fontSize: 12.5, color: color.muted }}>
                  External email: joins as a <strong style={{ color: color.ink3 }}>Guest</strong> and only sees this project. They can sign in with Google or Microsoft.
                </span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: `1px solid ${color.divider}`, flex: 'none' }}>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" loading={busy} disabled={name.trim().length < 2 || derivedKey.length !== 3} onClick={() => void submit()}>Create project</Button>
        </div>
      </div>
      </div>
    </>
  );
}
