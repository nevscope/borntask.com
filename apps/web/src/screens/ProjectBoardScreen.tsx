// Screen 3 · Project board. Columns are workflow statuses; dropping a card changes status, so
// the workflow rules apply: allowed columns light up while dragging, the rest fade, and a
// blocked drop explains who can make the move (with Ask / Override).
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { Skeleton } from 'antd';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject, useProjectTasks } from '../api/queries';
import type { ProjectDetail, Task, WorkflowStatus } from '../api/types';
import { Avatar, LockIcon, TypeTag } from '../components/Chips';
import { ProjectHeader } from '../components/ProjectHeader';
import { useQuickAdd } from '../components/QuickAdd';
import { useMoveFlow } from '../components/useMoveFlow';
import { useTaskParam } from '../components/useTaskParam';
import { dueColor, dueLabel, dueTone } from '../lib/dates';
import { checkMove, rolesLabel } from '../lib/workflow';
import { toneStyle } from '../theme/tokens';

export function ProjectBoardScreen() {
  const { projectKey = 'WEB' } = useParams();
  const detail = useProject(projectKey);
  const tasks = useProjectTasks(projectKey);
  const flow = useMoveFlow(detail.data);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  if (!detail.data || !tasks.data) return <div className="bt-page"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  const d = detail.data;
  const all = tasks.data;
  const active = activeKey ? all.find((t) => t.key === activeKey) : undefined;
  const statuses = [...d.workflow.statuses].sort((a, b) => a.position - b.position);

  return (
    <div className="bt-page">
      {flow.modal}
      <ProjectHeader detail={d} />
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveKey(String(e.active.id))}
        onDragCancel={() => setActiveKey(null)}
        onDragEnd={(e) => {
          setActiveKey(null);
          const task = all.find((t) => t.key === String(e.active.id));
          if (task && e.over) flow.requestMove(task, String(e.over.id));
        }}
      >
        <div className="bt-board">
          {statuses.map((s) => (
            <Column
              key={s.id}
              status={s}
              detail={d}
              tasks={all.filter((t) => t.statusId === s.id).sort((a, b) => a.position - b.position)}
              dragState={active ? (active.statusId === s.id ? 'origin' : checkMove(d.workflow, active, s.id, flow.myRoles).kind) : null}
              blockedReason={active && active.statusId !== s.id ? reasonFor(d, active, s.id, flow.myRoles) : null}
            />
          ))}
        </div>
        <DragOverlay>{active && <Card task={active} detail={d} overlay />}</DragOverlay>
      </DndContext>
    </div>
  );
}

function reasonFor(d: ProjectDetail, task: Task, toId: string, roles: Parameters<typeof checkMove>[3]) {
  const c = checkMove(d.workflow, task, toId, roles);
  return c.kind === 'not-allowed' ? `${rolesLabel(c.transition.roles)} only` : c.kind === 'no-path' ? 'Not the next step' : null;
}

type DragState = 'origin' | 'allowed' | 'not-allowed' | 'no-path' | null;

function Column({ status, detail, tasks, dragState, blockedReason }: { status: WorkflowStatus; detail: ProjectDetail; tasks: Task[]; dragState: DragState; blockedReason: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  const quickAdd = useQuickAdd();
  const over = status.wipLimit !== null && tasks.length > status.wipLimit;
  const cls = ['bt-column', status.side ? 'side' : '', dragState === 'allowed' ? 'allowed' : '', dragState === 'not-allowed' || dragState === 'no-path' ? 'blocked' : ''].join(' ');

  return (
    <section ref={setNodeRef} aria-label={status.name} className={cls} style={isOver && dragState === 'allowed' ? { boxShadow: 'inset 0 0 0 2px #178A5C' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px 4px', fontSize: 13, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneStyle[status.tone].dot }} />
        {status.name}
        <span style={{ fontWeight: 500, color: over ? '#B42323' : '#5B6157' }}>
          {status.wipLimit !== null ? `${tasks.length} / ${status.wipLimit}` : tasks.length}
        </span>
      </div>
      {blockedReason && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#5B6157', padding: '0 4px' }}><LockIcon size={11} /> {blockedReason}</span>
      )}
      {tasks.map((t) => <DraggableCard key={t.key} task={t} detail={detail} />)}
      {!status.side && status.category !== 'done' && (
        <button
          onClick={() => quickAdd.open({ projectKey: detail.project.key })}
          style={{ height: 34, padding: '0 8px', border: 0, borderRadius: 8, background: 'transparent', color: '#5B6157', fontSize: 13, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
        >
          + Add
        </button>
      )}
    </section>
  );
}

function DraggableCard({ task, detail }: { task: Task; detail: ProjectDetail }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.key });
  const { openTask } = useTaskParam();
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => openTask(task.key)}>
      <Card task={task} detail={detail} dragging={isDragging} />
    </div>
  );
}

function Card({ task, detail, overlay = false, dragging = false }: { task: Task; detail: ProjectDetail; overlay?: boolean; dragging?: boolean }) {
  const user = detail.users.find((u) => u.id === task.assigneeId);
  const tone = dueTone(task.dueDate);
  return (
    <div className={`bt-card-task${overlay ? ' overlay' : ''}${dragging ? ' dragging' : ''}`}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TypeTag type={task.type} small />
        <span style={{ fontSize: 12, color: '#5B6157' }}>{task.key}</span>
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35 }}>{task.title}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5B6157' }}>
        <Avatar user={user} size={22} />
        <span style={{ color: dueColor[tone], fontWeight: tone === 'today' || tone === 'overdue' ? 600 : 400 }}>{dueLabel(task.dueDate)}</span>
        {task.subtaskCount.total > 0 && <span style={{ marginLeft: 'auto' }}>{task.subtaskCount.done}/{task.subtaskCount.total}</span>}
      </span>
    </div>
  );
}
