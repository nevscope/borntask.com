import { Button, Input, Modal, Select } from 'antd';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe, useProject, useProjectTasks } from '../api/queries';
import { SettingsFrame } from '../components/SettingsNav';
import { color, typeStyle } from '../theme/tokens';
import type { TaskType } from '../api/types';

export function ProjectStructureScreen() {
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const detail = useProject(projectKey);
  const tasks = useProjectTasks(projectKey);
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string>('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
    void qc.invalidateQueries({ queryKey: qk.projectTasks(projectKey) });
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

  const archive = async () => {
    await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/archive`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    void qc.invalidateQueries({ queryKey: qk.projects });
  };

  const sections = detail.data?.sections ?? [];
  const counts = new Map<string, number>();
  for (const t of tasks.data ?? []) counts.set(t.sectionId, (counts.get(t.sectionId) ?? 0) + 1);

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin}>
      <h1 className="bt-h1">Sections, types and trash</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div className="bt-group-head">Sections</div>
          {sections.map((s) => (
            <div key={s.id} className="bt-row">
              <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
              <span style={{ fontSize: 12.5, color: color.muted }}>{counts.get(s.id) ?? 0} tasks</span>
              <Button type="link" onClick={() => { setRenameId(s.id); setRename(s.name); }}>Rename</Button>
              <Button type="link" danger onClick={() => { setDeleteId(s.id); setMoveTo(sections.find((x) => x.id !== s.id)?.id ?? ''); }}>Delete</Button>
            </div>
          ))}
          <div className="bt-row">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New section" style={{ flex: 1 }} />
            <Button type="link" onClick={() => void add()}>+ Add section</Button>
          </div>
        </section>
        <section className="bt-card" style={{ flex: '1 1 320px' }}>
          <div className="bt-group-head">Task types used here</div>
          {(Object.keys(typeStyle) as TaskType[]).map((slug) => (
            <div key={slug} className="bt-row">
              <span style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 6, background: typeStyle[slug].bg, color: typeStyle[slug].fg }}>
                {typeStyle[slug].label}
              </span>
              <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>Workspace default. Per-project toggles are not stored yet.</span>
            </div>
          ))}
        </section>
      </div>
      <section className="bt-card">
        <div className="bt-group-head">
          <span style={{ flex: 1 }}>Trash</span>
          <Link to={`/p/${projectKey}/trash`}>Open trash</Link>
        </div>
        <p style={{ padding: 16, margin: 0, color: color.muted, fontSize: 13 }}>Deleted tasks are kept for 30 days, then removed for good.</p>
      </section>
      <Button onClick={() => void archive()}>Archive project</Button>
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
