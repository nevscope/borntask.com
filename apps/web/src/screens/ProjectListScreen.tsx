// Screen 2 · Project list. Grouped by section; drag the handle to reorder or move between
// sections (never changes status). Status changes go through the task drawer's status menu.
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Button, Select, Skeleton, Switch } from 'antd';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMe, useProject, useProjectTasks, useReorderTask } from '../api/queries';
import type { ProjectDetail, Section, Task, TaskType } from '../api/types';
import { Avatar, PriorityLabel, StatusPill, TypeTag } from '../components/Chips';
import { ProjectHeader } from '../components/ProjectHeader';
import { useQuickAdd } from '../components/QuickAdd';
import { useTaskParam } from '../components/useTaskParam';
import { dueColor, dueLabel, dueTone } from '../lib/dates';
import { statusById } from '../lib/workflow';
import { typeStyle } from '../theme/tokens';

type AssigneeFilter = 'anyone' | 'me' | 'unassigned';

export function ProjectListScreen() {
  const { projectKey = 'WEB' } = useParams();
  const detail = useProject(projectKey);
  const tasks = useProjectTasks(projectKey);
  const me = useMe().data;
  const reorder = useReorderTask();
  const [types, setTypes] = useState<TaskType[]>([]);
  const [assignee, setAssignee] = useState<AssigneeFilter>('anyone');
  const [showDone, setShowDone] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  if (!detail.data || !tasks.data) return <div className="bt-page"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  const d = detail.data;

  const visible = tasks.data.filter((t) => {
    const cat = statusById(d.workflow, t.statusId)?.category;
    if (!showDone && cat === 'done') return false;
    if (types.length && !types.includes(t.type)) return false;
    if (assignee === 'me' && t.assigneeId !== me?.user.id) return false;
    if (assignee === 'unassigned' && t.assigneeId) return false;
    return true;
  });
  const active = activeKey ? tasks.data.find((t) => t.key === activeKey) : undefined;

  function onDragEnd(e: DragEndEvent) {
    setActiveKey(null);
    const key = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    if (over.startsWith('end:')) {
      reorder.mutate({ key, input: { sectionId: over.slice(4), beforeKey: null } });
    } else if (over.startsWith('row:')) {
      const beforeKey = over.slice(4);
      if (beforeKey === key) return;
      const target = tasks.data?.find((t) => t.key === beforeKey);
      if (target) reorder.mutate({ key, input: { sectionId: target.sectionId, beforeKey } });
    }
  }

  return (
    <div className="bt-page">
      <ProjectHeader detail={d} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Select<TaskType[]>
          mode="multiple"
          allowClear
          placeholder="Any type"
          value={types}
          onChange={setTypes}
          options={(Object.keys(typeStyle) as TaskType[]).map((t) => ({ value: t, label: typeStyle[t].label }))}
          style={{ minWidth: 200 }}
          aria-label="Filter by type"
        />
        <Select<AssigneeFilter>
          value={assignee}
          onChange={setAssignee}
          options={[{ value: 'anyone', label: 'Anyone' }, { value: 'me', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }]}
          style={{ minWidth: 160 }}
          aria-label="Filter by assignee"
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3A3F38' }}>
          <Switch size="small" checked={showDone} onChange={setShowDone} /> Show Deployed and Rejected
        </label>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#5B6157' }}>Grouped by section · drag ⋮⋮ to reorder</span>
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setActiveKey(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveKey(null)}>
        <div className="bt-card" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 980 }}>
            {d.sections.map((s) => (
              <SectionGroup key={s.id} section={s} detail={d} tasks={visible.filter((t) => t.sectionId === s.id).sort((a, b) => a.position - b.position)} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {active && (
            <div className="bt-row" style={{ borderRadius: 10, border: '1px solid #E8EBE6', boxShadow: '0 18px 32px -12px rgba(18,20,23,.35)', paddingLeft: 16 }}>
              <span className="bt-key">{active.key}</span>
              <span style={{ fontWeight: 500 }}>{active.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SectionGroup({ section, detail, tasks }: { section: Section; detail: ProjectDetail; tasks: Task[] }) {
  const quickAdd = useQuickAdd();
  const end = useDroppable({ id: `end:${section.id}` });
  return (
    <div>
      <div className="bt-group-head">{section.name} <span style={{ color: '#5B6157', fontWeight: 500 }}>{tasks.length}</span></div>
      {tasks.map((t) => <Row key={t.key} task={t} detail={detail} />)}
      <div ref={end.setNodeRef} className={`bt-row${end.isOver ? ' drop-before' : ''}`} style={{ paddingLeft: 36 }}>
        <Button type="text" size="small" style={{ color: '#5B6157' }} onClick={() => quickAdd.open({ projectKey: detail.project.key, sectionId: section.id })}>
          + Add task to {section.name}
        </Button>
      </div>
    </div>
  );
}

function Row({ task, detail }: { task: Task; detail: ProjectDetail }) {
  const { openTask } = useTaskParam();
  const drag = useDraggable({ id: task.key });
  const drop = useDroppable({ id: `row:${task.key}` });
  const user = detail.users.find((u) => u.id === task.assigneeId);
  const tone = dueTone(task.dueDate);
  const done = statusById(detail.workflow, task.statusId)?.category === 'done';

  return (
    <div
      ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      className={`bt-row${drop.isOver && !drag.isDragging ? ' drop-before' : ''}`}
      style={{ opacity: drag.isDragging ? 0.4 : 1, flexWrap: 'nowrap' }}
    >
      <button className="bt-handle" aria-label={`Drag ${task.key}`} {...drag.listeners} {...drag.attributes}>
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" /></svg>
      </button>
      <span className="bt-key">{task.key}</span>
      <button className="bt-row-title" style={{ color: done ? '#5B6157' : undefined }} onClick={() => openTask(task.key)}>
        {task.title}
        {task.subtaskCount.total > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#5B6157', fontWeight: 400 }}>{task.subtaskCount.done}/{task.subtaskCount.total}</span>}
      </button>
      <span style={{ width: 110 }}><TypeTag type={task.type} /></span>
      <span style={{ width: 160 }}><StatusPill status={statusById(detail.workflow, task.statusId)} /></span>
      <span style={{ width: 160, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3A3F38' }}>
        <Avatar user={user} /> {user?.name ?? 'Unassigned'}
      </span>
      <span style={{ width: 90, fontSize: 13, color: dueColor[tone], fontWeight: tone === 'overdue' || tone === 'today' ? 600 : 400 }}>{dueLabel(task.dueDate)}</span>
      <span style={{ width: 100 }}><PriorityLabel priority={task.priority} /></span>
    </div>
  );
}
