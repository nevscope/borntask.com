import { Alert, Button, Input } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import type { Workflow } from '../api/types';
import { RoleTag, TypeTag } from '../components/Chips';
import { SettingsFrame } from '../components/SettingsNav';
import { color, toneStyle } from '../theme/tokens';
import type { ProjectRole, TaskType } from '../api/types';

const ROLE_DESC: Record<string, string> = {
  lead: 'Owns the project and its settings',
  business: 'Raises ideas, approves scope',
  developer: 'Builds and fixes',
  tester: 'Verifies and signs off',
  observer: 'Views and comments only',
};

type Defaults = {
  roles: { id: string; name: string; slug: string; colour: string }[];
  types: { id: string; name: string; slug: string; colour: string; template: string | null }[];
  workflows: (Workflow & { projectCount?: number })[];
};

export function AdminDefaultsScreen() {
  const me = useMe().data;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const [roleName, setRoleName] = useState('');
  const [typeName, setTypeName] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ['admin-defaults'],
    enabled: canAdmin,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/admin/defaults`, { credentials: 'include' });
      if (!res.ok) throw new Error('Owners and admins only.');
      return (await res.json()) as Defaults;
    },
  });

  const defaultId = data.data?.workflows.find((w) => w.name === 'Delivery')?.id ?? data.data?.workflows[0]?.id;

  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin-defaults'] });

  const createRole = async () => {
    if (!roleName.trim()) return;
    setError(null);
    const res = await fetch(`${BASE_URL}/admin/roles`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roleName.trim() }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { message?: string };
      setError(json.message ?? 'Could not add the role.');
      return;
    }
    setRoleName('');
    setAddingRole(false);
    refresh();
  };

  const createType = async () => {
    if (!typeName.trim()) return;
    setError(null);
    const res = await fetch(`${BASE_URL}/admin/types`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: typeName.trim() }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { message?: string };
      setError(json.message ?? 'Could not add the type.');
      return;
    }
    setTypeName('');
    setAddingType(false);
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

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">Roles, types and workflows</h1>
      <p style={{ color: color.muted, margin: '6px 0 0', fontSize: 13.5 }}>Defaults every project in {me?.workspace.name ?? 'this workspace'} can use.</p>
      {!canAdmin && <Alert type="warning" message="Only an owner or admin can open workspace defaults." />}
      {data.error && <Alert type="error" message={data.error.message} />}
      {error && <Alert type="error" message={error} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Project roles</h2>
            {canAdmin && <button type="button" onClick={() => setAddingRole(true)} style={addBtn}>+ Add role</button>}
          </div>
          {addingRole && (
            <div style={{ display: 'flex', gap: 8, padding: 12 }}>
              <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Role name" onPressEnter={() => void createRole()} />
              <Button type="primary" onClick={() => void createRole()}>Add</Button>
            </div>
          )}
          {(data.data?.roles ?? []).map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              {isRole(r.slug) ? <RoleTag role={r.slug} /> : <span>{r.name}</span>}
              <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>{ROLE_DESC[r.slug] ?? r.slug}</span>
            </div>
          ))}
        </section>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Task types</h2>
            {canAdmin && <button type="button" onClick={() => setAddingType(true)} style={addBtn}>+ Add type</button>}
          </div>
          {addingType && (
            <div style={{ display: 'flex', gap: 8, padding: 12 }}>
              <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Type name" onPressEnter={() => void createType()} />
              <Button type="primary" onClick={() => void createType()}>Add</Button>
            </div>
          )}
          {(data.data?.types ?? []).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              {isType(t.slug) ? <TypeTag type={t.slug} /> : <span>{t.name}</span>}
              <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>{templateLine(t.template)}</span>
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
            <Link key={w.id} to="/settings/workflow" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 12, color: color.ink, textDecoration: 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{w.name}</span>
                {(w.id === defaultId || w.name === 'Delivery') && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: color.brandTint, color: color.brandStrong }}>Default</span>
                )}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, color: color.ink3 }}>
                {w.statuses.filter((s) => !s.side).map((s, i) => (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {i > 0 && <span style={{ color: color.muted }}>{'>'}</span>}
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: toneStyle[s.tone].dot }} />
                    {s.name}
                  </span>
                ))}
              </span>
              <span style={{ fontSize: 12.5, color: color.muted }}>{workflowCaption(w)}</span>
            </Link>
          ))}
        </div>
      </section>
    </SettingsFrame>
  );
}

const addBtn = { height: 30, padding: '0 8px', border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const;

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

function isRole(slug: string): slug is ProjectRole {
  return ['lead', 'business', 'developer', 'tester', 'observer'].includes(slug);
}

function isType(slug: string): slug is TaskType {
  return ['idea', 'bug', 'improvement', 'feature'].includes(slug);
}
