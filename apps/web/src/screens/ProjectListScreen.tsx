// Screen 2 · Project list. Drag the handle to reorder or move between sections.
// Click type, status, assignee, due date or priority to change them. Status goes through moveTask.
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Skeleton, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCopyTask, useMe, useProject, useProjectTasks, useReorderTask } from '../api/queries';
import { useStatusToast } from '../components/StatusToast';
import type { ProjectDetail, Task } from '../api/types';
import { CopyIcon, GitHubBadge, TaskHints } from '../components/Chips';
import { BulkBar } from '../components/BulkBar';
import { ListColumnHead } from '../components/ListColumnHead';
import { ListFields } from '../components/ListFields';
import { NoAccess } from '../components/NoAccess';
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectViewBar, useProjectView } from '../components/ProjectViewBar';
import { useQuickAdd } from '../components/QuickAdd';
import { useMoveFlow } from '../components/useMoveFlow';
import { useTaskParam } from '../components/useTaskParam';
import { useIsPhone } from '../hooks/useIsPhone';
import { useVisibleWindow } from '../hooks/useVisibleWindow';
import { readCollapsedGroups, writeCollapsedGroups } from '../lib/listCollapse';
import { choicesFor, groupTasks, LIST_FIELD_LABEL, LIST_FIELD_WIDTH, LIST_FIELDS, personChoices, sortTasks, takeGroupedTasks, taskMatches, type ListField } from '../lib/taskFilters';
import { statusById } from '../lib/workflow';
import { color } from '../theme/tokens';

export function ProjectListScreen() {
  const { projectKey = 'WEB' } = useParams();
  const detail = useProject(projectKey);
  const tasks = useProjectTasks(projectKey);
  const me = useMe().data;
  const view = useProjectView();
  const reorder = useReorderTask();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const flow = useMoveFlow(detail.data);
  const isPhone = useIsPhone();

  const manual = view.group === 'section' && view.sort === 'manual';
  const visible = useMemo(() => {
    if (!detail.data || !tasks.data) return [];
    return sortTasks(tasks.data.filter((task) => taskMatches(task, view.filters, detail.data, me?.user.id)), view.sort);
  }, [detail.data, tasks.data, view.filters, view.sort, me?.user.id]);
  const groups = useMemo(() => {
    if (!detail.data) return [];
    return groupTasks(visible, view.group, detail.data).map((group) => ({ ...group, tasks: sortTasks(group.tasks, view.sort) }));
  }, [detail.data, visible, view.group, view.sort]);
  const windowReset = `${projectKey}|${view.group}|${view.sort}|${JSON.stringify(view.filters)}`;
  const { shown, sentinelRef, remaining } = useVisibleWindow(visible.length, windowReset);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(readCollapsedGroups(projectKey, view.group)));
  useEffect(() => {
    setCollapsedIds(new Set(readCollapsedGroups(projectKey, view.group)));
  }, [projectKey, view.group]);
  const toggleGroup = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCollapsedGroups(projectKey, view.group, [...next]);
      return next;
    });
  };
  const windowed = takeGroupedTasks(groups, shown, collapsedIds);

  if (detail.isError || tasks.isError) return <NoAccess projectKey={projectKey} error={detail.error ?? tasks.error} />;
  if (!detail.data || !tasks.data) return <div className="bt-page"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  const d = detail.data;
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
    const moving = selected.includes(key) && selected.length > 1
      ? visible.filter((task) => selected.includes(task.key)).map((task) => task.key)
      : [key];
    const dropKeys = new Set(moving);
    if (over.startsWith('end:')) {
      const sectionId = over.slice(4);
      for (const item of moving) {
        reorder.mutate({ key: item, input: { sectionId, beforeKey: null } });
      }
    } else if (over.startsWith('row:')) {
      const beforeKey = over.slice(4);
      if (dropKeys.has(beforeKey) && moving.length === 1) return;
      const target = tasks.data.find((task) => task.key === beforeKey);
      if (!target) return;
      const insertBefore = dropKeys.has(beforeKey)
        ? visible.find((task) => task.sectionId === target.sectionId && !dropKeys.has(task.key) && task.position > target.position)?.key ?? null
        : beforeKey;
      for (const item of moving) {
        reorder.mutate({ key: item, input: { sectionId: target.sectionId, beforeKey: insertBefore } });
      }
    }
  }

  const list = (
    <div className="bt-card" style={{ overflowX: isPhone ? 'hidden' : 'auto' }}>
      <div style={{ minWidth: isPhone ? 0 : 980 }}>
        {!isPhone && (
        <div className="bt-row" style={{ minHeight: 36, fontSize: 12, fontWeight: 600, color: color.muted }}>
          <span style={{ width: 32 }} />
          <span style={{ width: 24 }} />
          <span className="bt-key">Key</span>
          <ListColumnHead
            label="Task"
            field="title"
            filters={view.filters}
            onFilters={(filters) => view.setView({ filters })}
          />
          {LIST_FIELDS.filter((field) => !view.hiddenCols.includes(field)).map((field) => (
            <ListColumnHead
              key={field}
              label={LIST_FIELD_LABEL[field]}
              width={LIST_FIELD_WIDTH[field]}
              field={field}
              filters={view.filters}
              choices={columnChoices(field, d, labels)}
              onFilters={(filters) => view.setView({ filters })}
            />
          ))}
        </div>
        )}
        {windowed.map((group) => (
          <SectionGroup
            key={group.id}
            id={group.id}
            name={group.name}
            total={group.total}
            detail={d}
            tasks={group.tasks}
            canAdd={view.group === 'section' && group.id !== 'other'}
            collapsed={collapsedIds.has(group.id)}
            onCollapse={() => toggleGroup(group.id)}
            draggable={manual}
            selected={selected}
            meId={me?.user.id}
            roles={flow.myRoles}
            onMove={flow.requestMove}
            onComplete={flow.requestComplete}
            onToggle={(key) => setSelected((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key])}
            compact={isPhone}
            hiddenCols={view.hiddenCols}
          />
        ))}
        {remaining > 0 && (
          <div ref={sentinelRef} style={{ padding: '10px 16px 14px', fontSize: 12.5, color: color.muted }}>
            Showing {shown} of {visible.length} tasks
          </div>
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
              {selected.includes(active.key) && selected.length > 1 && (
                <span style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 600, color: color.brandStrong }}>+{selected.length - 1} more</span>
              )}
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
  total,
  detail,
  tasks,
  canAdd,
  collapsed,
  onCollapse,
  draggable,
  selected,
  meId,
  roles,
  onMove,
  onComplete,
  onToggle,
  compact,
  hiddenCols,
}: {
  id: string;
  name: string;
  total: number;
  detail: ProjectDetail;
  tasks: Task[];
  canAdd: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  draggable: boolean;
  selected: string[];
  meId?: string;
  roles: ProjectDetail['members'][number]['roles'];
  onMove: (task: Task, statusId: string) => void;
  onComplete: (task: Task) => void;
  onToggle: (key: string) => void;
  compact: boolean;
  hiddenCols: ListField[];
}) {
  const quickAdd = useQuickAdd();
  const end = useDroppable({ id: `end:${id}`, disabled: !draggable });
  return (
    <div className="bt-section-group">
      <button
        type="button"
        className={`bt-group-head${end.isOver && collapsed ? ' drop-before' : ''}`}
        aria-expanded={!collapsed}
        onClick={onCollapse}
        ref={collapsed ? end.setNodeRef : undefined}
      >
        <svg className="bt-group-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {name} <span style={{ color: color.muted, fontWeight: 500 }}>{total}</span>
      </button>
      {!collapsed && tasks.map((task) => (
        <Row key={task.key} task={task} detail={detail} draggable={draggable && !compact} selected={selected.includes(task.key)} meId={meId} roles={roles} onMove={onMove} onComplete={onComplete} onToggle={() => onToggle(task.key)} compact={compact} hiddenCols={hiddenCols} />
      ))}
      {canAdd && !collapsed && (
        <div ref={end.setNodeRef} className={`bt-row${end.isOver ? ' drop-before' : ''}`} style={{ padding: '0 16px 0 58px', minHeight: 40, height: 40 }}>
          <button
            type="button"
            onClick={() => quickAdd.open({ projectKey: detail.project.key, sectionId: id })}
            style={{ height: 40, padding: 0, border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
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
  onComplete,
  onToggle,
  compact,
  hiddenCols,
}: {
  task: Task;
  detail: ProjectDetail;
  draggable: boolean;
  selected: boolean;
  meId?: string;
  roles: ProjectDetail['members'][number]['roles'];
  onMove: (task: Task, statusId: string) => void;
  onComplete: (task: Task) => void;
  onToggle: () => void;
  compact: boolean;
  hiddenCols: ListField[];
}) {
  const { openTask } = useTaskParam();
  const copyTask = useCopyTask();
  const toast = useStatusToast();
  const drag = useDraggable({ id: task.key, disabled: !draggable });
  const drop = useDroppable({ id: `row:${task.key}`, disabled: !draggable });
  const done = statusById(detail.workflow, task.statusId)?.category === 'done';
  const copy = (event: { stopPropagation(): void }) => {
    event.stopPropagation();
    copyTask.mutate(task.key, {
      onSuccess: (created) => {
        toast.show(`Created ${created.key}.`);
        openTask(created.key);
      },
      onError: (err) => toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not copy this task.' }),
    });
  };
  const copyControl = (
    <Tooltip title="Copy this task">
      <button
        type="button"
        className={`bt-row-copy${compact ? ' always' : ''}`}
        aria-label={`Copy ${task.key}`}
        disabled={copyTask.isPending}
        onClick={copy}
      >
        <CopyIcon />
      </button>
    </Tooltip>
  );

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
          <span className="bt-title-cluster" style={{ flex: 1, minWidth: 0 }}>
            <button type="button" className="bt-row-title" style={{ color: done ? color.muted : undefined, whiteSpace: 'normal', fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => openTask(task.key)}>
              <span>{task.title}</span>
              {task.subtaskCount.total > 0 && <span style={{ fontSize: 12, color: color.muted, fontWeight: 400 }}>{task.subtaskCount.done}/{task.subtaskCount.total}</span>}
              {task.githubBadge && <GitHubBadge kind={task.githubBadge} compact />}
              <TaskHints task={task} />
            </button>
            {copyControl}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 24, fontSize: 12, color: color.muted }}>
          <span>{task.key}</span>
          <ListFields compact task={task} detail={detail} meId={meId} roles={roles} onMove={onMove} onComplete={onComplete} hiddenCols={hiddenCols} />
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
      <span className="bt-title-cluster">
        <button className="bt-row-title" style={{ color: done ? color.muted : undefined, display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => openTask(task.key)}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
          {task.subtaskCount.total > 0 && <span style={{ fontSize: 12, color: color.muted, fontWeight: 400, flex: 'none' }}>{task.subtaskCount.done}/{task.subtaskCount.total}</span>}
          {task.githubBadge && <span style={{ flex: 'none' }}><GitHubBadge kind={task.githubBadge} compact /></span>}
          <TaskHints task={task} />
        </button>
        {copyControl}
      </span>
      <ListFields task={task} detail={detail} meId={meId} roles={roles} onMove={onMove} onComplete={onComplete} hiddenCols={hiddenCols} />
    </div>
  );
}

function columnChoices(field: ListField, detail: ProjectDetail, labels: string[]) {
  if (field === 'assignee') return personChoices(detail, 'assignee');
  const rows = choicesFor(field === 'due' ? 'due' : field, detail, 'is', labels);
  return Array.isArray(rows) ? rows : undefined;
}
