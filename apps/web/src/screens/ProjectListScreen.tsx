// Screen 2 · Project list. Drag the handle to reorder or move between sections.
// Click type, status, assignee, due date or priority to change them. Status goes through moveTask.
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Button, Input, Skeleton } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { qk, useMe, useProject, useProjectTasks, useReorderTask } from '../api/queries';
import type { ProjectDetail, Task } from '../api/types';
import { GitHubBadge } from '../components/Chips';
import { BulkBar } from '../components/BulkBar';
import { ListFields } from '../components/ListFields';
import { NoAccess } from '../components/NoAccess';
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectViewBar, useProjectView } from '../components/ProjectViewBar';
import { useQuickAdd } from '../components/QuickAdd';
import { useMoveFlow } from '../components/useMoveFlow';
import { useTaskParam } from '../components/useTaskParam';
import { useIsPhone } from '../hooks/useIsPhone';
import { groupTasks, sortTasks, taskMatches } from '../lib/taskFilters';
import { statusById } from '../lib/workflow';
import { color } from '../theme/tokens';

export function ProjectListScreen() {
  const { projectKey = 'WEB' } = useParams();
  const detail = useProject(projectKey);
  const tasks = useProjectTasks(projectKey);
  const me = useMe().data;
  const view = useProjectView();
  const reorder = useReorderTask();
  const qc = useQueryClient();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const flow = useMoveFlow(detail.data);
  const isPhone = useIsPhone();

  const manual = view.group === 'section' && view.sort === 'manual';
  const visible = useMemo(() => {
    if (!detail.data || !tasks.data) return [];
    return sortTasks(tasks.data.filter((task) => taskMatches(task, view.filters, detail.data, me?.user.id)), view.sort);
  }, [detail.data, tasks.data, view.filters, view.sort, me?.user.id]);

  if (detail.isError || tasks.isError) return <NoAccess projectKey={projectKey} error={detail.error ?? tasks.error} />;
  if (!detail.data || !tasks.data) return <div className="bt-page"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  const d = detail.data;
  const groups = groupTasks(visible, view.group, d).map((group) => ({ ...group, tasks: sortTasks(group.tasks, view.sort) }));
  const active = activeKey ? tasks.data.find((task) => task.key === activeKey) : undefined;
  const myRoles = d.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const canShare = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin' || myRoles.includes('lead');
  const selectedTasks = tasks.data.filter((task) => selected.includes(task.key));
  const labels = [...new Set(tasks.data.flatMap((task) => task.labels))];

  function onDragEnd(event: DragEndEvent) {
    setActiveKey(null);
    const key = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    if (!over || !tasks.data) return;
    if (over.startsWith('end:')) {
      reorder.mutate({ key, input: { sectionId: over.slice(4), beforeKey: null } });
    } else if (over.startsWith('row:')) {
      const beforeKey = over.slice(4);
      if (beforeKey === key) return;
      const target = tasks.data.find((task) => task.key === beforeKey);
      if (target) reorder.mutate({ key, input: { sectionId: target.sectionId, beforeKey } });
    }
  }

  async function addSection() {
    const name = sectionName.trim();
    if (!name) return;
    await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/sections`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSectionName('');
    setAdding(false);
    void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
  }

  const list = (
    <div className="bt-card" style={{ overflowX: isPhone ? 'hidden' : 'auto' }}>
      <div style={{ minWidth: isPhone ? 0 : 980 }}>
        {!isPhone && (
        <div className="bt-row" style={{ minHeight: 36, fontSize: 12, fontWeight: 600, color: color.muted }}>
          <span style={{ width: 32 }} />
          <span style={{ width: 24 }} />
          <span className="bt-key">Key</span>
          <span className="bt-row-title" style={{ fontWeight: 600, color: color.muted, cursor: 'default' }}>Task</span>
          <span style={{ width: 110 }}>Type</span>
          <span style={{ width: 160 }}>Status</span>
          <span style={{ width: 160 }}>Assignee</span>
          <span style={{ width: 90 }}>Due</span>
          <span style={{ width: 100 }}>Priority</span>
        </div>
        )}
        {groups.map((group) => (
          <SectionGroup
            key={group.id}
            id={group.id}
            name={group.name}
            detail={d}
            tasks={group.tasks}
            canAdd={view.group === 'section' && group.id !== 'other'}
            draggable={manual}
            selected={selected}
            meId={me?.user.id}
            roles={flow.myRoles}
            onMove={flow.requestMove}
            onToggle={(key) => setSelected((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key])}
            compact={isPhone}
          />
        ))}
        {adding ? (
          <div style={{ display: 'flex', gap: 8, padding: 12 }}>
            <Input autoFocus aria-label="Section name" value={sectionName} onChange={(event) => setSectionName(event.target.value)} onPressEnter={() => void addSection()} placeholder="Section name" />
            <Button type="primary" onClick={() => void addSection()}>Add section</Button>
            <Button onClick={() => { setAdding(false); setSectionName(''); }}>Cancel</Button>
          </div>
        ) : (
          <Button type="text" onClick={() => setAdding(true)} style={{ height: 44, color: color.brandStrong, fontWeight: 600 }}>+ Add section</Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="bt-page">
      <ProjectHeader detail={d} />
      <ProjectViewBar
        mode="list"
        detail={d}
        workspaceId={me?.workspace.id ?? 'local'}
        canShare={canShare}
        labels={labels}
        count={visible.length}
        view={view}
        onView={view.setView}
      />
      {flow.modal}
      {selectedTasks.length > 0 && (
        <BulkBar tasks={selectedTasks} detail={d} roles={myRoles} onClear={() => setSelected([])} />
      )}
      <DndContext sensors={sensors} onDragStart={(event) => setActiveKey(String(event.active.id))} onDragEnd={manual ? onDragEnd : () => setActiveKey(null)} onDragCancel={() => setActiveKey(null)}>
        {list}
        <DragOverlay>
          {active && manual && (
            <div className="bt-row" style={{ borderRadius: 10, border: `1px solid ${color.border}`, boxShadow: color.shadow, paddingLeft: 16 }}>
              <span className="bt-key">{active.key}</span>
              <span style={{ fontWeight: 500 }}>{active.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SectionGroup({
  id,
  name,
  detail,
  tasks,
  canAdd,
  draggable,
  selected,
  meId,
  roles,
  onMove,
  onToggle,
  compact,
}: {
  id: string;
  name: string;
  detail: ProjectDetail;
  tasks: Task[];
  canAdd: boolean;
  draggable: boolean;
  selected: string[];
  meId?: string;
  roles: ProjectDetail['members'][number]['roles'];
  onMove: (task: Task, statusId: string) => void;
  onToggle: (key: string) => void;
  compact: boolean;
}) {
  const quickAdd = useQuickAdd();
  const end = useDroppable({ id: `end:${id}`, disabled: !draggable });
  return (
    <div>
      <div className="bt-group-head">{name} <span style={{ color: color.muted, fontWeight: 500 }}>{tasks.length}</span></div>
      {tasks.map((task) => (
        <Row key={task.key} task={task} detail={detail} draggable={draggable && !compact} selected={selected.includes(task.key)} meId={meId} roles={roles} onMove={onMove} onToggle={() => onToggle(task.key)} compact={compact} />
      ))}
      {canAdd && (
        <div ref={end.setNodeRef} className={`bt-row${end.isOver ? ' drop-before' : ''}`} style={{ padding: '0 16px 0 58px', minHeight: 40, height: 40 }}>
          <button
            type="button"
            onClick={() => quickAdd.open({ projectKey: detail.project.key, sectionId: id })}
            style={{ height: 40, padding: 0, border: 0, background: 'transparent', color: color.muted, font: 'inherit', fontSize: 13, cursor: 'pointer' }}
          >
            + Add task to {name}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({
  task,
  detail,
  draggable,
  selected,
  meId,
  roles,
  onMove,
  onToggle,
  compact,
}: {
  task: Task;
  detail: ProjectDetail;
  draggable: boolean;
  selected: boolean;
  meId?: string;
  roles: ProjectDetail['members'][number]['roles'];
  onMove: (task: Task, statusId: string) => void;
  onToggle: () => void;
  compact: boolean;
}) {
  const { openTask } = useTaskParam();
  const drag = useDraggable({ id: task.key, disabled: !draggable });
  const drop = useDroppable({ id: `row:${task.key}`, disabled: !draggable });
  const done = statusById(detail.workflow, task.statusId)?.category === 'done';

  if (compact) {
    return (
      <div
        className="bt-row"
        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '10px 14px', minHeight: 0, background: selected ? color.brandTint : undefined }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            aria-label={`Select ${task.key}`}
            checked={selected}
            onChange={onToggle}
            style={{ width: 16, height: 16, marginTop: 3, accentColor: color.brand, flex: 'none' }}
          />
          <button type="button" className="bt-row-title" style={{ flex: 1, color: done ? color.muted : undefined, whiteSpace: 'normal', fontSize: 14.5, fontWeight: 500, lineHeight: 1.3 }} onClick={() => openTask(task.key)}>
            {task.title}
            {task.subtaskCount.total > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: color.muted, fontWeight: 400 }}>{task.subtaskCount.done}/{task.subtaskCount.total}</span>}
            {task.githubBadge && <span style={{ marginLeft: 8 }}><GitHubBadge kind={task.githubBadge} compact /></span>}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 24, fontSize: 12, color: color.muted }}>
          <span>{task.key}</span>
          <ListFields compact task={task} detail={detail} meId={meId} roles={roles} onMove={onMove} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      className={`bt-row${drop.isOver && !drag.isDragging ? ' drop-before' : ''}`}
      style={{ opacity: drag.isDragging ? 0.4 : 1, flexWrap: 'nowrap', background: selected ? color.brandTint : undefined }}
    >
      <input
        type="checkbox"
        aria-label={`Select ${task.key}`}
        checked={selected}
        onChange={onToggle}
        style={{ width: 16, height: 16, margin: '0 8px', accentColor: color.brand }}
      />
      <button className="bt-handle" aria-label={`Drag ${task.key}`} {...drag.listeners} {...drag.attributes}>
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" /></svg>
      </button>
      <span className="bt-key">{task.key}</span>
      <button className="bt-row-title" style={{ color: done ? color.muted : undefined }} onClick={() => openTask(task.key)}>
        {task.title}
        {task.subtaskCount.total > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: color.muted, fontWeight: 400 }}>{task.subtaskCount.done}/{task.subtaskCount.total}</span>}
        {task.githubBadge && <span style={{ marginLeft: 8 }}><GitHubBadge kind={task.githubBadge} compact /></span>}
      </button>
      <ListFields task={task} detail={detail} meId={meId} roles={roles} onMove={onMove} />
    </div>
  );
}
