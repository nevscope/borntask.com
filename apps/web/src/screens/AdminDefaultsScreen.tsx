import { Alert, Button, Input } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import type { Workflow } from '../api/types';
import { RoleTag, TypeTag } from '../components/Chips';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ColourSwatchRow } from '../components/ProjectColourField';
import { SettingsFrame } from '../components/SettingsNav';
import { color, projectSwatches, toneStyle } from '../theme/tokens';

type RoleRow = { id: string; name: string; slug: string; colour: string };
type TypeRow = { id: string; name: string; slug: string; colour: string; template: string | null };
type Defaults = {
  defaultWorkflowId?: string | null;
  roles: RoleRow[];
  types: TypeRow[];
  workflows: (Workflow & { projectCount?: number })[];
};

export function AdminDefaultsScreen() {
  const me = useMe().data;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const [error, setError] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<{ id: string | 'new'; name: string; colour: string } | null>(null);
  const [typeDraft, setTypeDraft] = useState<{ id: string | 'new'; name: string; colour: string; template: string } | null>(null);
  const [pending, setPending] = useState<{ kind: 'role' | 'type' | 'workflow'; id: string; name: string } | null>(null);
  const data = useQuery({
    queryKey: ['admin-defaults'],
    enabled: canAdmin,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/admin/defaults`, { credentials: 'include' });
      if (!res.ok) throw new Error('Owners and admins only.');
      return (await res.json()) as Defaults;
    },
  });

  const defaultId = data.data?.defaultWorkflowId ?? data.data?.workflows.find((w) => w.name === 'Delivery')?.id ?? data.data?.workflows[0]?.id;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-defaults'] });
    void qc.invalidateQueries({ queryKey: ['workspace-catalog'] });
  };

  const readError = async (res: Response, fallback: string) => {
    const json = await res.json().catch(() => ({})) as { message?: string };
    return json.message ?? fallback;
  };

  const saveRole = async () => {
    if (!roleDraft?.name.trim()) return;
    setError(null);
    const isNew = roleDraft.id === 'new';
    const res = await fetch(isNew ? `${BASE_URL}/admin/roles` : `${BASE_URL}/admin/roles/${encodeURIComponent(roleDraft.id)}`, {
      method: isNew ? 'POST' : 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roleDraft.name.trim(), colour: roleDraft.colour }),
    });
    if (!res.ok) {
      setError(await readError(res, 'Could not save the role.'));
      return;
    }
    setRoleDraft(null);
    refresh();
  };

  const saveType = async () => {
    if (!typeDraft?.name.trim()) return;
    setError(null);
    const isNew = typeDraft.id === 'new';
    const res = await fetch(isNew ? `${BASE_URL}/admin/types` : `${BASE_URL}/admin/types/${encodeURIComponent(typeDraft.id)}`, {
      method: isNew ? 'POST' : 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: typeDraft.name.trim(), colour: typeDraft.colour, template: typeDraft.template }),
    });
    if (!res.ok) {
      setError(await readError(res, 'Could not save the type.'));
      return;
    }
    setTypeDraft(null);
    refresh();
  };

  const createWorkflow = async () => {
    setError(null);
    const res = await fetch(`${BASE_URL}/admin/workflows`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New workflow' }),
    });
    const json = await res.json().catch(() => ({})) as { id?: string; message?: string };
    if (!res.ok || !json.id) {
      setError(json.message ?? 'Could not create the workflow.');
      return;
    }
    navigate(`/settings/workflow?id=${encodeURIComponent(json.id)}`);
  };

  const confirmDelete = async () => {
    if (!pending) return;
    setError(null);
    const path = pending.kind === 'workflow'
      ? `${BASE_URL}/workflows/${encodeURIComponent(pending.id)}`
      : `${BASE_URL}/admin/${pending.kind === 'role' ? 'roles' : 'types'}/${encodeURIComponent(pending.id)}`;
    const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      setError(await readError(res, `Could not delete the ${pending.kind}.`));
      setPending(null);
      return;
    }
    setPending(null);
    refresh();
  };

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">Roles, types and workflows</h1>
      <p style={{ color: color.muted, margin: '6px 0 0', fontSize: 13.5 }}>Add, edit or remove the defaults every project in {me?.workspace.name ?? 'this workspace'} can use.</p>
      {!canAdmin && <Alert type="warning" message="Only an owner or admin can open workspace defaults." />}
      {data.error && <Alert type="error" message={data.error.message} />}
      {error && <Alert type="error" message={error} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Project roles</h2>
            {canAdmin && (
              <button type="button" onClick={() => setRoleDraft({ id: 'new', name: '', colour: projectSwatches[5]?.hex ?? color.muted })} style={addBtn}>
                + Add role
              </button>
            )}
          </div>
          {roleDraft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderBottom: `1px solid ${color.divider}` }}>
              <Input value={roleDraft.name} onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })} placeholder="Role name" onPressEnter={() => void saveRole()} />
              <ColourSwatchRow colour={roleDraft.colour} onColour={(hex) => setRoleDraft({ ...roleDraft, colour: hex })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="primary" onClick={() => void saveRole()}>{roleDraft.id === 'new' ? 'Add' : 'Save'}</Button>
                <Button onClick={() => setRoleDraft(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {(data.data?.roles ?? []).map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <RoleTag role={r.slug} />
              <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>{r.slug}</span>
              {canAdmin && (
                <>
                  <button type="button" onClick={() => setRoleDraft({ id: r.id, name: r.name, colour: r.colour })} style={editBtn}>Edit</button>
                  <button type="button" onClick={() => setPending({ kind: 'role', id: r.id, name: r.name })} style={removeBtn} disabled={r.slug === 'lead'}>Delete</button>
                </>
              )}
            </div>
          ))}
        </section>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Task types</h2>
            {canAdmin && (
              <button type="button" onClick={() => setTypeDraft({ id: 'new', name: '', colour: projectSwatches[1]?.hex ?? color.brand, template: '' })} style={addBtn}>
                + Add type
              </button>
            )}
          </div>
          {typeDraft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderBottom: `1px solid ${color.divider}` }}>
              <Input value={typeDraft.name} onChange={(e) => setTypeDraft({ ...typeDraft, name: e.target.value })} placeholder="Type name" onPressEnter={() => void saveType()} />
              <ColourSwatchRow colour={typeDraft.colour} onColour={(hex) => setTypeDraft({ ...typeDraft, colour: hex })} />
              <Input.TextArea
                value={typeDraft.template}
                onChange={(e) => setTypeDraft({ ...typeDraft, template: e.target.value })}
                placeholder="Optional description template"
                autoSize={{ minRows: 3, maxRows: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="primary" onClick={() => void saveType()}>{typeDraft.id === 'new' ? 'Add' : 'Save'}</Button>
                <Button onClick={() => setTypeDraft(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {(data.data?.types ?? []).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <TypeTag type={t.slug} />
              <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>{templateLine(t.template)}</span>
              {canAdmin && (
                <>
                  <button type="button" onClick={() => setTypeDraft({ id: t.id, name: t.name, colour: t.colour, template: t.template ?? '' })} style={editBtn}>Edit</button>
                  <button type="button" onClick={() => setPending({ kind: 'type', id: t.id, name: t.name })} style={removeBtn}>Delete</button>
                </>
              )}
            </div>
          ))}
        </section>
      </div>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Workflows</h2>
          {canAdmin && <button type="button" onClick={() => void createWorkflow()} style={{ height: 34, padding: '0 12px', border: `1px solid ${color.border}`, borderRadius: 8, background: color.surface, font: 'inherit', fontSize: 13, cursor: 'pointer' }}>New workflow</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {(data.data?.workflows ?? []).map((w) => (
            <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 12 }}>
              <Link to={`/settings/workflow?id=${encodeURIComponent(w.id)}`} style={{ display: 'flex', flexDirection: 'column', gap: 12, color: color.ink, textDecoration: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{w.name}</span>
                  {w.id === defaultId && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: color.brandTint, color: color.brandStrong }}>Default</span>
                  )}
                </span>
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, color: color.ink3 }}>
                  {w.statuses.filter((s) => !s.side).map((s, i) => (
                    <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {i > 0 && <span style={{ color: color.muted }}>{'>'}</span>}
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.colour ?? toneStyle[s.tone].dot }} />
                      {s.name}
                    </span>
                  ))}
                </span>
                <span style={{ fontSize: 12.5, color: color.muted }}>{workflowCaption(w)}</span>
              </Link>
              {canAdmin && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <Link to={`/settings/workflow?id=${encodeURIComponent(w.id)}`} style={{ fontSize: 13, fontWeight: 600, color: color.brandStrong }}>Edit</Link>
                  <button type="button" onClick={() => setPending({ kind: 'workflow', id: w.id, name: w.name })} style={removeBtn}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={pending !== null}
        title={pending ? `Delete ${pending.name}?` : 'Delete?'}
        confirmLabel="Delete"
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmDelete()}
      >
        {pending?.kind === 'workflow'
          ? 'Projects using this workflow must be switched first. This cannot be undone.'
          : pending?.kind === 'type'
            ? 'Tasks that still use this type must be changed first.'
            : 'People who still have this role must lose it first. The lead role cannot be deleted.'}
      </ConfirmDialog>
    </SettingsFrame>
  );
}

const addBtn = { height: 30, padding: '0 8px', border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const;
const editBtn = { height: 30, padding: 0, border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, cursor: 'pointer' } as const;
const removeBtn = { height: 30, padding: 0, border: 0, background: 'transparent', color: color.danger, font: 'inherit', fontSize: 13, cursor: 'pointer' } as const;

function templateLine(template: string | null) {
  if (!template?.trim()) return 'No template';
  const headings = [...template.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]?.trim().toLowerCase()).filter(Boolean);
  if (headings.length) return `Template: ${headings.join(', ')}`;
  const first = template.split('\n').map((line) => line.trim()).find(Boolean)?.replace(/^#+\s*/, '');
  return first ? `Template: ${first}` : 'No template';
}

function workflowCaption(workflow: Workflow & { projectCount?: number }) {
  const stages = workflow.statuses.filter((status) => !status.side).length || workflow.statuses.length;
  const open = workflow.transitions.length > 0 && workflow.transitions.every((transition) => transition.roles.length === 0);
  const used = workflow.projectCount ?? 0;
  const projects = `${used} ${used === 1 ? 'project' : 'projects'}`;
  if (open) return `${stages} stages, anyone can move tasks · used by ${projects}`;
  return `${stages} stages · ${workflow.transitions.length} moves · used by ${projects}`;
}
