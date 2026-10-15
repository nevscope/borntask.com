// Screen 3 · Project board. Columns are workflow statuses; dropping a card changes status, so
// the workflow rules apply: allowed columns light up while dragging, the rest fade, and a
// blocked drop explains who can make the move (with Ask / Override).
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { Skeleton } from 'antd';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMe, useProject, useProjectTasks } from '../api/queries';
import type { ProjectDetail, Task, WorkflowStatus } from '../api/types';
import { Avatar, LockIcon, TypeTag } from '../components/Chips';
import { NoAccess } from '../components/NoAccess';
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectViewBar, useProjectView } from '../components/ProjectViewBar';
import { useQuickAdd } from '../components/QuickAdd';
import { useMoveFlow } from '../components/useMoveFlow';
import { useTaskParam } from '../components/useTaskParam';
import { dueColor, dueLabel, dueTone } from '../lib/dates';
import { groupTasks, taskMatches, type TaskGroup } from '../lib/taskFilters';
import { checkMove, rolesLabel } from '../lib/workflow';
import { color, toneStyle } from '../theme/tokens';

export function ProjectBoardScreen() {
  const { projectKey = 'WEB' } = useParams();
  const detail = useProject(projectKey);
  const tasks = useProjectTasks(projectKey);
  const me = useMe().data;
  const view = useProjectView();
  const flow = useMoveFlow(detail.data, { board: true });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [openSides, setOpenSides] = useState<Record<string, boolean>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  const visible = useMemo(() => {
    if (!detail.data || !tasks.data) return [];
    return tasks.data.filter((task) => taskMatches(task, view.filters, detail.data, me?.user.id));
  }, [detail.data, tasks.data, view.filters, me?.user.id]);

  if (detail.isError || tasks.isError) return <NoAccess projectKey={projectKey} error={detail.error ?? tasks.error} />;
  if (!detail.data || !tasks.data) return <div className="bt-page"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  const d = detail.data;
  const active = activeKey ? visible.find((task) => task.key === activeKey) : undefined;
  const statuses = [...d.workflow.statuses].sort((a, b) => a.position - b.position);
  const myRoles = d.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const canShare = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin' || myRoles.includes('lead');
  const labels = [...new Set(tasks.data.flatMap((task) => task.labels))];
  const byStatus = view.columns === 'status';
  const grouped: TaskGroup[] = byStatus
    ? []
    : groupTasks(visible, view.columns, d).filter((group) => group.tasks.length > 0 || view.columns === 'section');

  return (
    <div className="bt-page">
      {flow.modal}
      <ProjectHeader detail={d} />
      <ProjectViewBar
        mode="board"
        detail={d}
        workspaceId={me?.workspace.id ?? 'local'}
        canShare={canShare}
        labels={labels}
        count={visible.length}
        view={view}
        onView={view.setView}
      />
      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveKey(String(event.active.id))}
        onDragCancel={() => setActiveKey(null)}
        onDragEnd={(event) => {
          setActiveKey(null);
          if (!byStatus) return;
          const task = visible.find((row) => row.key === String(event.active.id));
          if (task && event.over) flow.requestMove(task, String(event.over.id));
        }}
      >
        <div className="bt-board">
          {byStatus ? statuses.filter((status) => !status.side).map((status) => (
            <Column
              key={status.id}
              status={status}
              detail={d}
              tasks={visible.filter((task) => task.statusId === status.id).sort((a, b) => a.position - b.position)}
              dragState={active ? (active.statusId === status.id ? 'origin' : checkMove(d.workflow, active, status.id, flow.myRoles).kind) : null}
              blockedReason={active && active.statusId !== status.id ? reasonFor(d, active, status.id, flow.myRoles) : null}
            />
          )) : grouped.map((group) => (
            <StaticColumn key={group.id} name={group.name} tasks={group.tasks} detail={d} />
          ))}
          {byStatus && (
            <div style={{ display: 'flex', gap: 8 }}>
              {statuses.filter((status) => status.side).map((status) => {
                const columnTasks = visible.filter((task) => task.statusId === status.id);
                if (openSides[status.id]) {
                  return (
                    <div key={status.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button type="button" onClick={() => setOpenSides((prev) => ({ ...prev, [status.id]: false }))} style={{ border: 0, background: 'transparent', color: color.muted, font: 'inherit', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                        Collapse
                      </button>
                      <Column
                        status={status}
                        detail={d}
                        tasks={columnTasks}
                        dragState={active ? (active.statusId === status.id ? 'origin' : checkMove(d.workflow, active, status.id, flow.myRoles).kind) : null}
                        blockedReason={active && active.statusId !== status.id ? reasonFor(d, active, status.id, flow.myRoles) : null}
                      />
                    </div>
                  );
                }
                return (
                  <SideRail
                    key={status.id}
                    status={status}
                    count={columnTasks.length}
                    onExpand={() => setOpenSides((prev) => ({ ...prev, [status.id]: true }))}
                  />
                );
              })}
            </div>
          )}
        </div>
        <DragOverlay>{active && <Card task={active} detail={d} overlay />}</DragOverlay>
      </DndContext>
    </div>
  );
}

function reasonFor(d: ProjectDetail, task: Task, toId: string, roles: Parameters<typeof checkMove>[3]) {
  const result = checkMove(d.workflow, task, toId, roles);
  return result.kind === 'not-allowed' ? `${rolesLabel(result.transition.roles)} only` : result.kind === 'no-path' ? 'Not the next step' : null;
}

type DragState = 'origin' | 'allowed' | 'not-allowed' | 'no-path' | null;

function SideRail({ status, count, onExpand }: { status: WorkflowStatus; count: number; onExpand: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Expand ${status.name}, ${count} ${count === 1 ? 'task' : 'tasks'}`}
      onClick={onExpand}
      style={{
        width: 44,
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '12px 0',
        border: `1px dashed ${isOver ? color.brand : color.dashed}`,
        borderRadius: 12,
        background: isOver ? color.brandTint : 'transparent',
        font: 'inherit',
        fontSize: 12.5,
        color: color.ink3,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontWeight: 600 }}>{count}</span>
      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{status.name}</span>
    </button>
  );
}

function Column({ status, detail, tasks, dragState, blockedReason }: { status: WorkflowStatus; detail: ProjectDetail; tasks: Task[]; dragState: DragState; blockedReason: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  const quickAdd = useQuickAdd();
  const over = status.wipLimit !== null && tasks.length > status.wipLimit;
  const cls = ['bt-column', status.side ? 'side' : '', dragState === 'allowed' ? 'allowed' : '', dragState === 'not-allowed' || dragState === 'no-path' ? 'blocked' : ''].join(' ');

  return (
    <section ref={setNodeRef} aria-label={status.name} className={cls} style={isOver && dragState === 'allowed' ? { boxShadow: `inset 0 0 0 2px ${color.brand}` } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px 4px', fontSize: 13, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneStyle[status.tone].dot }} />
        {status.name}
        <span style={{ fontWeight: 500, color: over ? color.danger : color.muted }}>
          {status.wipLimit !== null ? `${tasks.length} / ${status.wipLimit}` : tasks.length}
        </span>
      </div>
      {blockedReason && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: color.muted, padding: '0 4px' }}><LockIcon size={11} /> {blockedReason}</span>
      )}
      {tasks.map((task) => <DraggableCard key={task.key} task={task} detail={detail} />)}
      {!status.side && status.category !== 'done' && (
        <button
          onClick={() => quickAdd.open({ projectKey: detail.project.key })}
          style={{ height: 34, padding: '0 8px', border: 0, borderRadius: 8, background: 'transparent', color: color.muted, fontSize: 13, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
        >
          + Add
        </button>
      )}
    </section>
  );
}

function StaticColumn({ name, tasks, detail }: { name: string; tasks: Task[]; detail: ProjectDetail }) {
  const { openTask } = useTaskParam();
  return (
    <section aria-label={name} className="bt-column">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px 4px', fontSize: 13, fontWeight: 600 }}>
        {name}
        <span style={{ fontWeight: 500, color: color.muted }}>{tasks.length}</span>
      </div>
      {tasks.map((task) => (
        <button key={task.key} type="button" onClick={() => openTask(task.key)} style={{ border: 0, padding: 0, background: 'transparent', textAlign: 'left' }}>
          <Card task={task} detail={detail} />
        </button>
      ))}
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
        <span style={{ fontSize: 12, color: color.muted }}>{task.key}</span>
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35 }}>{task.title}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: color.muted }}>
        <Avatar user={user} size={22} />
        <span style={{ color: dueColor[tone], fontWeight: tone === 'today' || tone === 'overdue' ? 600 : 400 }}>{dueLabel(task.dueDate)}</span>
        {task.subtaskCount.total > 0 && <span style={{ marginLeft: 'auto' }}>{task.subtaskCount.done}/{task.subtaskCount.total}</span>}
      </span>
    </div>
  );
}
