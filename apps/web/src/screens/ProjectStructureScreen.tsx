import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Button, Input, Modal, Select, Switch } from 'antd';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { qk, USE_TASK_MOCKS, useMe, useProject, useProjectTasks, useProjectTrash, useRestoreTask } from '../api/queries';
import { BASE_URL } from '../api/http';
import { SettingsFrame } from '../components/SettingsNav';
import { TypeTag } from '../components/Chips';
import { color } from '../theme/tokens';
import { useWorkspaceCatalog } from '../api/catalog';
import type { BuiltinTaskType } from '../api/types';

const TYPE_TPL: Record<BuiltinTaskType, string> = {
  idea: 'Template: problem, who benefits',
  bug: 'Template: steps, expected, actual',
  improvement: 'Template: current, proposed',
  feature: 'Template: acceptance criteria',
  story: 'Template: outcome, in scope',
  epic: 'Template: goal, why now',
};

export function ProjectStructureScreen() {
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const catalog = useWorkspaceCatalog();
  const detail = useProject(projectKey);
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const myRoles = detail.data?.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const canToggleTypes = canAdmin || myRoles.includes('lead') || detail.data?.project.leadId === me?.user.id;
  const tasks = useProjectTasks(projectKey);
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>('');
  const [typeDraft, setTypeDraft] = useState('');
  const [addingType, setAddingType] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);

  const trash = useProjectTrash(projectKey);
  const restore = useRestoreTask();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
    void qc.invalidateQueries({ queryKey: qk.projectTasks(projectKey) });
    void qc.invalidateQueries({ queryKey: ['workspace-catalog'] });
  };

  const toggleType = async (slug: string, on: boolean) => {
    const current = detail.data?.disabledTypes ?? [];
    const next = on ? current.filter((item) => item !== slug) : [...new Set([...current, slug])];
    setTypeError(null);
    const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabledTypes: next }),
    });
    const json = await res.json().catch(() => ({})) as { message?: string };
    if (!res.ok) {
      setTypeError(json.message ?? 'Could not update types for this project.');
      return;
    }
    refresh();
  };

  const addType = async () => {
    if (!typeDraft.trim()) return;
    setTypeError(null);
    const res = await fetch(`${BASE_URL}/admin/types`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: typeDraft.trim() }),
    });
    const json = await res.json().catch(() => ({})) as { message?: string };
    if (!res.ok) {
      setTypeError(json.message ?? 'Could not add that type. Owners and admins can add workspace types.');
      return;
    }
    setTypeDraft('');
    setAddingType(false);
    refresh();
  };

  const add = async () => {
    if (!newName.trim()) return;
    await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/sections`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName('');
    setAdding(false);
    refresh();
  };

  const saveRename = async () => {
    if (!renameId || !rename.trim()) return;
    await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/sections/${encodeURIComponent(renameId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: rename.trim() }),
    });
    setRenameId(null);
    refresh();
  };

  const saveOrder = async (ids: string[]) => {
    await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/sections/reorder`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    refresh();
  };

  const confirmDelete = async () => {
    if (!deleteId || !moveTo) return;
    await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/sections/${encodeURIComponent(deleteId)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveToSectionId: moveTo }),
    });
    setDeleteId(null);
    refresh();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const sections = [...(detail.data?.sections ?? [])].sort((a, b) => a.position - b.position);
  const counts = new Map<string, number>();

  const onDragEnd = (event: DragEndEvent) => {
    const from = String(event.active.id);
    const to = event.over ? String(event.over.id) : '';
    if (!to || from === to) return;
    const next = [...sections];
    const fromIndex = next.findIndex((section) => section.id === from);
    const toIndex = next.findIndex((section) => section.id === to);
    if (fromIndex < 0 || toIndex < 0) return;
    const [item] = next.splice(fromIndex, 1);
    if (!item) return;
    next.splice(toIndex, 0, item);
    void saveOrder(next.map((section) => section.id));
  };
  for (const t of tasks.data ?? []) counts.set(t.sectionId, (counts.get(t.sectionId) ?? 0) + 1);

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">Sections, types and trash</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Sections</h2>
            <span style={{ fontSize: 12.5, color: color.muted }}>Drag to reorder</span>
          </div>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {sections.map((s) => (
            <SectionRow key={s.id} id={s.id} name={s.name}>
              <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontSize: 12.5, color: color.muted }}>{counts.get(s.id) ?? 0} tasks</span>
              <Button type="link" onClick={() => { setRenameId(s.id); setRename(s.name); }}>Rename</Button>
              <Button type="link" danger onClick={() => { setDeleteId(s.id); setMoveTo(sections.find((x) => x.id !== s.id)?.id ?? ''); }}>Delete</Button>
            </SectionRow>
          ))}
          </DndContext>
          {adding ? (
            <div className="bt-row">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New section" onPressEnter={() => void add()} style={{ flex: 1 }} />
              <Button type="link" onClick={() => void add()}>Add</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} style={{ height: 44, padding: '0 16px', border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add section</button>
          )}
        </section>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Task types used here</h2>
          </div>
          {typeError && <p style={{ margin: 0, padding: '10px 16px', color: color.danger, fontSize: 12.5 }}>{typeError}</p>}
          {(catalog.types.length ? catalog.types : (Object.keys(TYPE_TPL) as BuiltinTaskType[]).map((slug) => ({ slug, template: TYPE_TPL[slug] }))).map((row) => {
            const slug = row.slug;
            const disabled = (detail.data?.disabledTypes ?? []).includes(slug);
            const used = (tasks.data ?? []).filter((task) => task.type === slug).length;
            return (
            <label key={slug} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <TypeTag type={slug} />
              <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>
                {'template' in row && row.template ? (slug in TYPE_TPL ? TYPE_TPL[slug as BuiltinTaskType] : 'Custom type') : (slug in TYPE_TPL ? TYPE_TPL[slug as BuiltinTaskType] : 'No template')}
                {used > 0 ? ` · ${used} here` : ''}
              </span>
              <Switch
                checked={!disabled}
                disabled={!canToggleTypes}
                aria-label={`Use ${slug} in this project`}
                onChange={(on) => void toggleType(slug, on)}
              />
            </label>
            );
          })}
          {canAdmin && (
            addingType ? (
              <div className="bt-row">
                <Input value={typeDraft} onChange={(e) => setTypeDraft(e.target.value)} placeholder="New type name" onPressEnter={() => void addType()} style={{ flex: 1 }} />
                <Button type="link" onClick={() => void addType()}>Add</Button>
                <Button type="link" onClick={() => { setAddingType(false); setTypeDraft(''); }}>Cancel</Button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingType(true)} style={{ height: 44, padding: '0 16px', border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add a task type</button>
            )
          )}
        </section>
      </div>
      <section className="bt-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Trash <span style={{ fontWeight: 500, color: color.muted }}>{trash.data?.length ?? 0}</span></h2>
          <span style={{ fontSize: 12.5, color: color.muted }}>Deleted tasks are kept for 30 days, then removed for good</span>
        </div>
        {(trash.data ?? []).map((t) => (
          <div key={t.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', minHeight: 52, padding: '8px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <span style={{ width: 58, fontSize: 12.5, color: color.muted }}>{t.key}</span>
            <span style={{ flex: '1 1 240px', fontWeight: 500 }}>{t.title}</span>
            <span style={{ fontSize: 12.5, color: color.muted }}>{trashMeta(t)}</span>
            <Button onClick={() => restore.mutate(t.key)}>Restore</Button>
          </div>
        ))}
        {(trash.data ?? []).length === 0 && <p style={{ padding: 16, margin: 0, color: color.muted, fontSize: 13 }}>{USE_TASK_MOCKS ? 'Trash is empty in mock mode.' : 'Trash is empty.'}</p>}
      </section>
      <Modal title="Rename section" open={!!renameId} onOk={() => void saveRename()} onCancel={() => setRenameId(null)}>
        <Input value={rename} onChange={(e) => setRename(e.target.value)} />
      </Modal>
      <Modal title="Delete section" open={!!deleteId} onOk={() => void confirmDelete()} onCancel={() => setDeleteId(null)} okButtonProps={{ disabled: !moveTo }}>
        <p>Move its tasks to:</p>
        <Select
          style={{ width: '100%' }}
          value={moveTo || undefined}
          onChange={setMoveTo}
          options={sections.filter((s) => s.id !== deleteId).map((s) => ({ value: s.id, label: s.name }))}
        />
      </Modal>
    </SettingsFrame>
  );
}

function trashMeta(task: { deletedByName?: string | null; daysLeft?: number | null }) {
  const who = task.deletedByName ? `Deleted by ${task.deletedByName}` : 'Deleted';
  if (task.daysLeft == null) return who;
  const left = task.daysLeft === 1 ? '1 day left' : task.daysLeft === 0 ? 'less than a day left' : `${task.daysLeft} days left`;
  return `${who} · ${left}`;
}

function SectionRow({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const drag = useDraggable({ id });
  const drop = useDroppable({ id });
  return (
    <div
      ref={(node) => { drag.setNodeRef(node); drop.setNodeRef(node); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 12px 0 8px', borderBottom: `1px solid ${color.divider}`, background: drop.isOver ? color.brandTint : 'transparent' }}
    >
      <button
        type="button"
        aria-label={`Drag ${name}`}
        {...drag.listeners}
        {...drag.attributes}
        style={{ width: 28, height: 32, border: 0, background: 'transparent', color: color.muted, cursor: 'grab' }}
      >
        ::
      </button>
      {children}
    </div>
  );
}
