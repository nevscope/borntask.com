import { Alert, Button, Checkbox, Select } from 'antd';
import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import type { StatusCategory, Transition, WorkflowStatus } from '../api/types';
import { RoleTag } from '../components/Chips';
import { SettingsFrame } from '../components/SettingsNav';
import { color, toneStyle } from '../theme/tokens';

type Stage = WorkflowStatus & { taskCount: number };
type EditorWorkflow = {
  id: string;
  name: string;
  projectCount?: number;
  statuses: Stage[];
  transitions: Transition[];
};
type PendingRemoval = { stage: Stage; to: string; index: number; rows: Transition[] };

const CATEGORIES: { value: StatusCategory; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'active', label: 'Active' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

const dotFor = (category: StatusCategory) => toneStyle[category === 'active' ? 'blue' : category === 'review' ? 'orange' : category === 'done' ? 'green' : 'neutral'].dot;

const field: CSSProperties = {
  height: 34,
  width: '100%',
  padding: '0 8px',
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  font: 'inherit',
  fontSize: 13,
  background: color.surface,
  color: color.ink,
};

export function WorkflowEditorScreen() {
  const { projectKey } = useParams();
  const [params] = useSearchParams();
  const wantedId = params.get('id');
  const me = useMe().data;
  const canEdit = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const [workflows, setWorkflows] = useState<EditorWorkflow[]>([]);
  const [id, setId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [rows, setRows] = useState<Transition[]>([]);
  const [removals, setRemovals] = useState<PendingRemoval[]>([]);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${BASE_URL}/workflows`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Workflows need a signed-in session and the API.');
        return r.json() as Promise<EditorWorkflow[]>;
      })
      .then((list) => {
        const normalised = list.map(normalise);
        setWorkflows(normalised);
        const first = normalised.find((workflow) => workflow.id === wantedId) ?? normalised[0];
        if (first) setId(first.id);
      })
      .catch((e: Error) => setError(e.message));
  }, [wantedId]);

  useEffect(() => {
    const wf = workflows.find((w) => w.id === id);
    if (!wf) return;
    setStages(wf.statuses);
    setRows(wf.transitions);
    setRemovals([]);
    setBaseline(JSON.stringify({ stages: wf.statuses, rows: wf.transitions }));
  }, [id, workflows]);

  const wf = workflows.find((w) => w.id === id);
  const dirty = JSON.stringify({ stages, rows }) !== baseline || removals.length > 0;

  const patch = (stageId: string, next: Partial<Stage>) => {
    setSaved(false);
    setStages((list) => list.map((s) => (s.id === stageId ? { ...s, ...next } : s)));
  };

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setSaved(false);
    setStages((list) => {
      const from = list.findIndex((s) => s.id === fromId);
      const to = list.findIndex((s) => s.id === toId);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      if (!item) return list;
      next.splice(to, 0, item);
      return next;
    });
  };

  const moveBy = (index: number, delta: number) => {
    const target = stages[index + delta];
    const current = stages[index];
    if (!target || !current) return;
    reorder(current.id, target.id);
  };

  const removeStage = (stage: Stage, index: number) => {
    if (stages.length < 2) {
      setError('A workflow needs at least one stage.');
      return;
    }
    const rest = stages.filter((s) => s.id !== stage.id);
    const to = rest[0]?.id ?? '';
    const dropped = rows.filter((row) => row.from === stage.id || row.to === stage.id);
    setSaved(false);
    setError(null);
    setRemovals((list) => [...list, { stage, to, index, rows: dropped }]);
    setStages(rest);
    setRows((list) => list.filter((row) => row.from !== stage.id && row.to !== stage.id));
  };

  const undoRemoval = (pending: PendingRemoval) => {
    setRemovals((list) => list.filter((r) => r.stage.id !== pending.stage.id));
    setStages((list) => {
      const next = [...list];
      next.splice(Math.min(pending.index, next.length), 0, pending.stage);
      return next;
    });
    setRows((list) => [...list, ...pending.rows]);
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    const missing = removals.find((r) => r.stage.taskCount > 0 && !r.to);
    if (missing) {
      setError(`Choose where the tasks on ${missing.stage.name} should go.`);
      return;
    }
    const res = await fetch(`${BASE_URL}/workflows/${encodeURIComponent(id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statuses: stages.map((s) => ({ id: s.id, name: s.name.trim(), category: s.category, wipLimit: s.wipLimit })),
        remaps: removals.map((r) => ({ from: r.stage.id, to: r.to })),
        transitions: rows,
      }),
    });
    const json = await res.json() as EditorWorkflow & { message?: string };
    if (!res.ok) {
      setError(json.message ?? 'Could not save');
      return;
    }
    const next = normalise(json);
    setWorkflows((list) => list.map((w) => (w.id === next.id ? next : w)));
    setSaved(true);
  };

  const nameOf = (statusId: string) => (statusId === '*' ? 'Any stage' : stages.find((s) => s.id === statusId)?.name ?? statusId);
  const usedBy = wf?.projectCount === 1 ? '1 project' : `${wf?.projectCount ?? 0} projects`;

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canEdit} isOwner={me?.workspaceRole === 'owner'}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: '1 1 300px' }}>
          <h1 className="bt-h1">Workflow</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: color.muted }}>
            {wf?.name ?? 'Choose a workflow'} · used by {usedBy}. Owner and admin only.
          </p>
        </div>
        {dirty && <span style={{ fontSize: 13, color: color.warning }}>Unsaved changes</span>}
        <Select
          aria-label="Workflow"
          value={id || undefined}
          onChange={setId}
          options={workflows.map((w) => ({ value: w.id, label: w.name }))}
          style={{ minWidth: 220 }}
          placeholder="Choose a workflow"
        />
        <Button type="primary" disabled={!canEdit || !id} onClick={() => void save()}>Save workflow</Button>
      </div>
      {!canEdit && <Alert type="warning" showIcon message="You can view this page, but only an owner or admin can save changes." />}
      {error && <Alert type="error" showIcon message={error} />}
      {saved && <Alert type="success" showIcon message="Workflow saved." />}

      {removals.filter((r) => r.stage.taskCount > 0).map((r) => (
        <div key={r.stage.id} role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 14px', border: `1px solid ${color.warningBorder}`, borderRadius: 10, background: color.warningTint, fontSize: 13.5, color: color.warning }}>
          <span style={{ flex: '1 1 280px' }}>
            You removed <strong>{r.stage.name}</strong>. Move its {r.stage.taskCount} {r.stage.taskCount === 1 ? 'task' : 'tasks'} to
          </span>
          <select
            aria-label={`Move tasks from ${r.stage.name} to`}
            value={r.to}
            disabled={!canEdit}
            onChange={(e) => setRemovals((list) => list.map((item) => item.stage.id === r.stage.id ? { ...item, to: e.target.value } : item))}
            style={{ ...field, width: 'auto', minWidth: 160 }}
          >
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" onClick={() => undoRemoval(r)} style={{ height: 34, padding: '0 12px', border: 0, borderRadius: 8, background: 'transparent', font: 'inherit', fontSize: 13, color: color.warning, textDecoration: 'underline', cursor: 'pointer' }}>
            Undo removal
          </button>
        </div>
      ))}

      <section className="bt-card" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Stages</h2>
            <button type="button" disabled={!canEdit} onClick={() => {
              setSaved(false);
              setStages((list) => [...list, { id: `new:${Date.now()}`, name: 'New stage', category: 'backlog', tone: 'neutral', position: list.length, wipLimit: null, side: false, taskCount: 0 }]);
            }} style={{ height: 32, padding: '0 10px', border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: canEdit ? 'pointer' : 'not-allowed' }}>
              + Add stage
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(180px, 1fr) 150px 110px 90px 120px', gap: 12, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
            <span />
            <span>Name</span>
            <span>Category</span>
            <span>WIP limit</span>
            <span>Tasks</span>
            <span />
          </div>
          {stages.map((s, index) => (
            <div
              key={s.id}
              draggable={canEdit}
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) reorder(dragId, s.id); setDragId(null); }}
              style={{ display: 'grid', gridTemplateColumns: '36px minmax(180px, 1fr) 150px 110px 90px 120px', gap: 12, alignItems: 'center', minHeight: 48, padding: '0 16px', borderBottom: `1px solid ${color.divider}`, background: s.side ? color.subtle : color.surface }}
            >
              <button type="button" aria-label={`Drag ${s.name}`} disabled={!canEdit} style={{ width: 28, height: 32, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: color.faint, cursor: canEdit ? 'grab' : 'default', padding: 0 }}>
                <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" /></svg>
              </button>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotFor(s.category), flex: 'none' }} />
                <input aria-label={`Name for ${s.name}`} value={s.name} disabled={!canEdit} onChange={(e) => patch(s.id, { name: e.target.value })} style={field} />
                {s.side ? <span style={{ fontSize: 12, color: color.muted, flex: 'none' }}>side column</span> : null}
              </span>
              <select aria-label={`Category for ${s.name}`} value={s.category} disabled={!canEdit} onChange={(e) => patch(s.id, { category: e.target.value as StatusCategory })} style={field}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input
                aria-label={`WIP limit for ${s.name}`}
                inputMode="numeric"
                value={s.wipLimit ?? ''}
                placeholder="-"
                disabled={!canEdit}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const n = Number(raw);
                  patch(s.id, { wipLimit: raw === '' || !Number.isFinite(n) || n < 1 ? null : Math.floor(n) });
                }}
                style={field}
              />
              <span style={{ fontSize: 13, color: color.muted }}>{s.taskCount}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button type="button" aria-label={`Move ${s.name} up`} disabled={!canEdit || index === 0} onClick={() => moveBy(index, -1)} style={iconBtn}>↑</button>
                <button type="button" aria-label={`Move ${s.name} down`} disabled={!canEdit || index === stages.length - 1} onClick={() => moveBy(index, 1)} style={iconBtn}>↓</button>
                <button type="button" aria-label={`Remove ${s.name}`} disabled={!canEdit} onClick={() => removeStage(s, index)} style={{ height: 32, border: 0, background: 'transparent', color: color.danger, font: 'inherit', fontSize: 13, cursor: canEdit ? 'pointer' : 'not-allowed' }}>
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="bt-card" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 640 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Who can move tasks</h2>
            <span style={{ fontSize: 12.5, color: color.muted }}>Admins and project leads can always override. Overrides are logged.</span>
          </div>
          {rows.map((r, i) => (
            <div key={`${r.from}-${r.to}-${r.label ?? ''}-${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 24px minmax(140px, 1fr) minmax(200px, 1.4fr) 64px', gap: 12, alignItems: 'center', minHeight: 46, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <span>{nameOf(r.from)}</span>
              <span style={{ color: color.muted }}>→</span>
              <span>{nameOf(r.to)}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {r.roles.length === 0 ? <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 8px', borderRadius: 6, background: color.chip, color: color.ink3 }}>Any member</span> : r.roles.map((role) => <RoleTag key={role} role={role} />)}
                {r.label ? <span style={{ fontSize: 12, color: color.muted }}>{r.label}</span> : null}
                <Checkbox
                  checked={r.requireComment}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setSaved(false);
                    const next = [...rows];
                    next[i] = { ...r, requireComment: e.target.checked };
                    setRows(next);
                  }}
                >
                  Comment
                </Checkbox>
              </span>
              <button type="button" disabled={!canEdit} onClick={() => { setSaved(false); setRows(rows.filter((_, j) => j !== i)); }} style={{ border: 0, background: 'transparent', color: color.muted, font: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={!canEdit || stages.length < 2}
            onClick={() => {
              const from = stages[0]?.id;
              const to = stages[1]?.id;
              if (!from || !to) return;
              setSaved(false);
              setRows([...rows, { from, to, roles: [], requireComment: false, label: null }]);
            }}
            style={{ height: 44, padding: '0 16px', border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: canEdit ? 'pointer' : 'not-allowed' }}
          >
            + Add a move
          </button>
        </div>
      </section>
    </div>
    </SettingsFrame>
  );
}

function normalise(wf: EditorWorkflow): EditorWorkflow {
  return {
    ...wf,
    statuses: (wf.statuses ?? []).map((s) => ({ ...s, taskCount: s.taskCount ?? 0 })),
    transitions: wf.transitions ?? [],
  };
}

const iconBtn: CSSProperties = {
  width: 22,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  border: 0,
  background: 'transparent',
  color: color.faint,
  cursor: 'pointer',
  padding: 0,
};
