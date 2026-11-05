import { Empty, Skeleton } from 'antd';
import { useMemo } from 'react';
import { useMe, useProjects, useWorkspaceTasks } from '../api/queries';
import { StatusPill, TaskHints, TypeTag } from '../components/Chips';
import { useTaskParam } from '../components/useTaskParam';
import { useWorkspaceView, WorkspaceViewBar } from '../components/WorkspaceViewBar';
import { useIsPhone } from '../hooks/useIsPhone';
import { useVisibleWindow } from '../hooks/useVisibleWindow';
import { dueColor, dueLabel, dueTone } from '../lib/dates';
import { groupWorkspaceTasks, sortTasks, takeGroupedTasks, taskMatches, workspaceFilterDetail } from '../lib/taskFilters';
import { color } from '../theme/tokens';

export function WorkspaceViewsScreen() {
  const me = useMe().data;
  const projects = (useProjects().data ?? []).filter((project) => project.canOpen !== false);
  const data = useWorkspaceTasks();
  const view = useWorkspaceView(me?.workspace.id ?? '');
  const { openTask } = useTaskParam();
  const isPhone = useIsPhone();

  const detail = useMemo(() => (data.data ? workspaceFilterDetail(data.data, projects) : null), [data.data, projects]);
  const visible = useMemo(() => {
    if (!data.data || !detail) return [];
    return sortTasks(data.data.tasks.filter((task) => taskMatches(task, view.filters, detail, me?.user.id)), view.sort);
  }, [data.data, detail, view.filters, view.sort, me?.user.id]);
  const groups = useMemo(() => {
    if (!data.data) return [];
    return groupWorkspaceTasks(visible, view.group, projects, data.data.users).map((group) => ({
      ...group,
      tasks: sortTasks(group.tasks, view.sort),
    }));
  }, [visible, view.group, view.sort, projects, data.data]);
  const { shown, sentinelRef, remaining } = useVisibleWindow(visible.length, `${view.group}|${view.sort}|${JSON.stringify(view.filters)}`);
  const windowed = takeGroupedTasks(groups, shown);

  if (data.isLoading || !detail) return <div className="bt-page"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  if (data.isError) {
    return (
      <div className="bt-page" style={{ paddingTop: 32 }}>
        <h1 className="bt-h1" style={{ fontSize: 26 }}>Views</h1>
        <p style={{ color: color.muted }}>Could not load workspace tasks.</p>
      </div>
    );
  }

  return (
    <div className="bt-page" style={{ paddingTop: isPhone ? 8 : 32, gap: isPhone ? 12 : 22 }}>
      <div>
        <h1 className="bt-h1" style={{ fontSize: 26 }}>Views</h1>
        <p style={{ margin: '6px 0 12px', color: color.muted, fontSize: 13.5 }}>
          Across every project you can open · {visible.length} {visible.length === 1 ? 'task' : 'tasks'}
        </p>
        <WorkspaceViewBar
          workspaceId={me?.workspace.id ?? ''}
          detail={detail}
          labels={data.data?.labels ?? []}
          count={visible.length}
          view={view}
          onView={view.setView}
        />
      </div>

      {visible.length === 0 && <Empty description="No tasks match this view." />}

      {windowed.map((group) => (
        <section key={group.id} className="bt-card">
          <div className="bt-group-head" style={{ color: color.ink }}>
            {group.name} <span style={{ color: color.muted, fontWeight: 500 }}>{group.total}</span>
          </div>
          {group.tasks.map((task) => {
            const project = projects.find((row) => row.key === task.projectKey);
            const status = detail.workflow.statuses.find((row) => row.id === task.statusId);
            if (isPhone) {
              return (
                <button
                  key={task.key}
                  type="button"
                  className="bt-row"
                  onClick={() => openTask(task.key)}
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '10px 14px', minHeight: 0, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, textAlign: 'left' }}>{task.title}</span>
                  <span style={{ display: 'flex', gap: 8, fontSize: 12, color: color.muted }}>
                    <span>{task.key}</span>
                    <span>{project?.name ?? task.projectKey}</span>
                    <span style={{ marginLeft: 'auto', color: dueColor[dueTone(task.dueDate)], fontWeight: dueTone(task.dueDate) === 'normal' ? 400 : 600 }}>{dueLabel(task.dueDate)}</span>
                  </span>
                </button>
              );
            }
            return (
              <div key={task.key} className="bt-row" style={{ paddingLeft: 16 }}>
                <span className="bt-key">{task.key}</span>
                <button className="bt-row-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => openTask(task.key)}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                  <TaskHints task={task} />
                </button>
                <TypeTag type={task.type} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 150, fontSize: 12.5, color: color.ink3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: project?.color ?? color.faint }} />
                  {project?.name ?? task.projectKey}
                </span>
                <span style={{ width: 150 }}>{status && <StatusPill status={status} />}</span>
                <span style={{ width: 90, textAlign: 'right', fontSize: 12.5, color: dueColor[dueTone(task.dueDate)], fontWeight: dueTone(task.dueDate) === 'normal' ? 400 : 600 }}>{dueLabel(task.dueDate)}</span>
              </div>
            );
          })}
        </section>
      ))}

      {remaining > 0 && (
        <div ref={sentinelRef} style={{ padding: '4px 4px 0', fontSize: 12.5, color: color.muted }}>
          Showing {shown} of {visible.length} tasks
        </div>
      )}
    </div>
  );
}
