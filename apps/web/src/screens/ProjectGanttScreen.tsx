// Project Gantt. Bars come from start and due dates. Click a bar to open the task; click empty space to add one.
import { Skeleton } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ganttBar,
  ganttBarLayout,
  ganttDays,
  ganttOnTrack,
  ganttWindow,
  isProjectKey,
  type GanttScale,
} from '@borntask/shared';
import { deniedProjectError, missingProjectError, projectQueryUnavailable, useMe, useProject, useProjectTasks, useWorkspaceSettings } from '../api/queries';
import type { ProjectDetail, Task } from '../api/types';
import { Avatar } from '../components/Chips';
import { GanttAddPopover, type GanttAddAnchor } from '../components/GanttAddPopover';
import { NoAccess } from '../components/NoAccess';
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectViewBar, useProjectView } from '../components/ProjectViewBar';
import { useTaskParam } from '../components/useTaskParam';
import { useIsPhone } from '../hooks/useIsPhone';
import { readShowHiddenSections, writeShowHiddenSections } from '../lib/lastViewed';
import { allowedGroup, groupTasks, sortTasks, taskMatches } from '../lib/taskFilters';
import { statusById } from '../lib/workflow';
import { color, font, radius } from '../theme/tokens';

/** Timeline day width that fits about a month in a 1536px window (sidebar + labels). */
const DAY_PX_MONTH = 34;
const DAY_PX_WEEK = 48;
const DAY_PX_MIN = 16;
const DAY_PX_MAX = 72;
const LEFT_DESKTOP = 220;
const LEFT_PHONE = 148;
const ROW_H = 36;
const HEAD_H = 52;

function todayYmd(): string {
  return dayjs().format('YYYY-MM-DD');
}

function taskOpen(detail: ProjectDetail, task: Task): boolean {
  return statusById(detail.workflow, task.statusId)?.category !== 'done';
}

function barOverdue(detail: ProjectDetail, task: Task, today: string): boolean {
  const due = task.dueDate;
  return Boolean(taskOpen(detail, task) && due && due < today);
}

function groupRange(tasks: Task[]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const task of tasks) {
    const bar = ganttBar(task.startDate, task.dueDate);
    const from = bar.start;
    const to = bar.end;
    if (!from || !to) continue;
    if (start === null || from < start) start = from;
    if (end === null || to > end) end = to;
  }
  if (!start || !end) return null;
  return { start, end };
}

function isWeekend(ymd: string): boolean {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function weekdayLetter(ymd: string): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${ymd}T00:00:00Z`).getUTCDay()] ?? '';
}

function rangeLabel(start: string | null, due: string | null): string {
  const a = start ? dayjs(start).format('D MMM') : 'No date';
  const b = due ? dayjs(due).format('D MMM') : 'No date';
  return `${a} - ${b}`;
}

function isWeekTick(ymd: string, weekStart: 'monday' | 'sunday'): boolean {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return weekStart === 'sunday' ? day === 0 : day === 1;
}

export function ProjectGanttScreen() {
  const { projectKey = 'WEB' } = useParams();
  const detail = useProject(projectKey);
  const tasks = useProjectTasks(projectKey);
  const me = useMe().data;
  const view = useProjectView();
  const settings = useWorkspaceSettings();
  const { openTask } = useTaskParam();
  const isPhone = useIsPhone();
  const [showHidden, setShowHidden] = useState(() => readShowHiddenSections(projectKey));
  const [scale, setScale] = useState<GanttScale>('month');
  const [dayPx, setDayPx] = useState(DAY_PX_MONTH);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [addAnchor, setAddAnchor] = useState<GanttAddAnchor | null>(null);
  const hoverPos = useRef({ x: 0, y: 0 });
  const hoverTip = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScroll = useRef(false);
  const today = todayYmd();
  const weekStart = settings.data?.weekStart ?? 'monday';
  const leftW = isPhone ? LEFT_PHONE : LEFT_DESKTOP;

  const visible = useMemo(() => {
    if (!detail.data || !tasks.data) return [];
    return sortTasks(tasks.data.filter((task) => taskMatches(task, view.filters, detail.data, me?.user.id)), view.sort);
  }, [detail.data, tasks.data, view.filters, view.sort, me?.user.id]);

  const groups = useMemo(() => {
    if (!detail.data) return [];
    return groupTasks(visible, allowedGroup(view.group, detail.data.workBreakdown), detail.data, tasks.data, showHidden)
      .map((group) => ({ ...group, tasks: sortTasks(group.tasks, view.sort) }))
      .filter((group) => group.tasks.length > 0 || view.group === 'section');
  }, [detail.data, visible, view.group, view.sort, tasks.data, showHidden]);

  const dated = useMemo(() => visible.filter((task) => ganttBar(task.startDate, task.dueDate).kind !== 'unscheduled'), [visible]);
  const unscheduled = useMemo(() => visible.filter((task) => ganttBar(task.startDate, task.dueDate).kind === 'unscheduled'), [visible]);

  const horizon = useMemo(() => {
    const bars = dated.map((task) => ganttBar(task.startDate, task.dueDate));
    return ganttWindow(bars, today, scale);
  }, [dated, today, scale]);

  const days = useMemo(() => ganttDays(horizon.from, horizon.to), [horizon.from, horizon.to]);
  const gridW = days.length * dayPx;

  const onTrack = useMemo(() => {
    if (!detail.data) return ganttOnTrack([], today);
    return ganttOnTrack(
      visible.map((task) => ({
        startDate: task.startDate,
        dueDate: task.dueDate,
        isBlocked: task.isBlocked,
        open: taskOpen(detail.data, task),
      })),
      today,
    );
  }, [detail.data, visible, today]);

  useEffect(() => {
    didScroll.current = false;
  }, [projectKey, scale]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || didScroll.current || days.length === 0) return;
    const todayIndex = days.indexOf(today);
    if (todayIndex < 0) return;
    el.scrollLeft = Math.max(0, leftW + todayIndex * dayPx - el.clientWidth / 3);
    didScroll.current = true;
  }, [days, today, dayPx, leftW]);

  if (!isProjectKey(projectKey) || projectQueryUnavailable(detail) || projectQueryUnavailable(tasks)) {
    return <NoAccess projectKey={projectKey} error={deniedProjectError(detail.error, tasks.error) ?? missingProjectError(projectKey)} />;
  }
  if (!detail.data || !tasks.data) return <div className="bt-page"><Skeleton active paragraph={{ rows: 12 }} /></div>;
  const d = detail.data;
  const canWrite = me?.workspaceRole !== 'viewer' && me?.workspaceRole !== 'guest';
  const defaultSectionId = d.sections[0]?.id ?? '';
  const myRoles = d.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const canShare = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin' || myRoles.includes('lead');
  const labels = [...new Set(tasks.data.flatMap((task) => task.labels))];

  const hoverTask = hoverKey ? visible.find((task) => task.key === hoverKey) : undefined;

  const moveHover = (event: { clientX: number; clientY: number }) => {
    hoverPos.current = { x: event.clientX, y: event.clientY };
    const tip = hoverTip.current;
    if (!tip) return;
    tip.style.left = `${Math.min(event.clientX + 12, globalThis.innerWidth - 280)}px`;
    tip.style.top = `${event.clientY + 12}px`;
  };

  const headerBands = (() => {
    const bands: { label: string; count: number }[] = [];
    for (const day of days) {
      const label = scale === 'week'
        ? (isWeekTick(day, weekStart) || bands.length === 0 ? `Week of ${dayjs(day).format('D MMM')}` : bands[bands.length - 1]?.label ?? '')
        : dayjs(day).format('MMMM YYYY');
      const last = bands[bands.length - 1];
      if (last && last.label === label) last.count += 1;
      else bands.push({ label, count: 1 });
    }
    return bands;
  })();

  const setScaleAndPx = (next: GanttScale) => {
    setScale(next);
    setDayPx(next === 'week' ? DAY_PX_WEEK : DAY_PX_MONTH);
  };

  const sectionForGroup = (groupId: string) => {
    if (view.group === 'section' && d.sections.some((section) => section.id === groupId)) return groupId;
    return defaultSectionId;
  };

  const parentForGroup = (groupId: string) => {
    if ((view.group === 'story' || view.group === 'epic') && groupId !== 'none') return groupId;
    return null;
  };

  const openAddFromGrid = (
    event: { currentTarget: HTMLElement; clientX: number; clientY: number; stopPropagation: () => void },
    rowKey: string,
    sectionId: string,
    planningParentId: string | null,
  ) => {
    if (!canWrite) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left) / dayPx);
    const ymd = days[index];
    if (!ymd) return;
    setHoverKey(null);
    setAddAnchor({
      ymd,
      left: index * dayPx,
      width: Math.max(dayPx, 28),
      clientX: event.clientX,
      clientY: event.clientY,
      rowKey,
      sectionId,
      planningParentId,
    });
  };

  return (
    <div className="bt-page">
      <ProjectHeader detail={d} />
      <ProjectViewBar
        mode="gantt"
        detail={d}
        workspaceId={me?.workspace.id ?? 'local'}
        canShare={canShare}
        labels={labels}
        count={visible.length}
        view={view}
        onView={view.setView}
        showHidden={showHidden}
        onShowHidden={(on) => {
          setShowHidden(on);
          writeShowHiddenSections(projectKey, on);
        }}
      />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          minHeight: 36,
          padding: '6px 10px',
          borderRadius: radius.md,
          background: onTrack.overdue ? color.dangerTint : color.brandTint,
          color: onTrack.overdue ? color.danger : color.brandStrong,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span style={{ flex: 1 }}>{onTrack.summary}</span>
        <span style={{ fontWeight: 500, color: color.ink3 }}>{onTrack.dated} dated · {onTrack.unscheduled} unscheduled</span>
        <span role="group" aria-label="Scale" style={{ display: 'inline-flex', gap: 4 }}>
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={scale === option}
              onClick={() => setScaleAndPx(option)}
              style={{
                ...zoomBtn,
                width: 'auto',
                padding: '0 10px',
                fontWeight: scale === option ? 600 : 500,
                background: scale === option ? color.brandTint : color.surface,
                color: scale === option ? color.brandStrong : color.ink,
              }}
            >
              {option === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <button type="button" aria-label="Zoom out" onClick={() => setDayPx((px) => Math.max(DAY_PX_MIN, px - 4))} style={zoomBtn}>-</button>
          <button type="button" aria-label="Zoom in" onClick={() => setDayPx((px) => Math.min(DAY_PX_MAX, px + 4))} style={zoomBtn}>+</button>
        </span>
      </div>

      {unscheduled.length > 0 && (
        <div className="bt-card" style={{ padding: 0 }}>
          <button
            type="button"
            className="bt-group-head"
            aria-expanded={unscheduledOpen}
            onClick={() => setUnscheduledOpen((open) => !open)}
          >
            <span className="bt-group-chevron">▾</span>
            Unscheduled
            <span style={{ fontWeight: 500, color: color.muted }}>{unscheduled.length}</span>
          </button>
          {unscheduledOpen && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
              {unscheduled.map((task) => (
                <button
                  key={task.key}
                  type="button"
                  onClick={() => openTask(task.key)}
                  style={{
                    height: 32,
                    padding: '0 10px',
                    border: `1px dashed ${color.dashed}`,
                    borderRadius: radius.md,
                    background: color.subtle,
                    color: color.ink,
                    font: 'inherit',
                    fontSize: 12.5,
                    cursor: 'pointer',
                  }}
                >
                  {task.key} {task.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="bt-gantt-scroll">
        <div style={{ minWidth: leftW + gridW }}>
          <div className="bt-gantt-head" style={{ display: 'flex', height: HEAD_H, borderBottom: `1px solid ${color.divider}` }}>
            <div className="bt-gantt-corner" style={{ width: leftW, flex: 'none', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: color.muted }}>
              Task
            </div>
            <div style={{ position: 'relative', width: gridW, flex: 'none' }}>
              <div style={{ display: 'flex', height: 22, fontSize: 11.5, fontWeight: 600, color: color.ink3 }}>
                {headerBands.map((band, index) => (
                  <div key={`${band.label}-${index}`} style={{ width: band.count * dayPx, paddingLeft: 6, borderLeft: `1px solid ${color.divider}`, overflow: 'hidden', whiteSpace: 'nowrap' }}>{band.label}</div>
                ))}
              </div>
              <div style={{ display: 'flex', height: 30 }}>
                {days.map((day) => {
                  const weekend = isWeekend(day);
                  const weekTick = isWeekTick(day, weekStart);
                  return (
                    <div
                      key={day}
                      className={weekend ? 'bt-gantt-weekend' : undefined}
                      style={{
                        width: dayPx,
                        flex: 'none',
                        textAlign: 'center',
                        fontSize: 10.5,
                        color: day === today ? color.brandStrong : color.muted,
                        fontWeight: day === today || weekTick ? 600 : 400,
                        borderLeft: weekTick ? `1px solid ${color.border}` : undefined,
                      }}
                    >
                      <div>{weekdayLetter(day)}</div>
                      <div>{dayjs(day).format('D')}</div>
                    </div>
                  );
                })}
              </div>
              <TodayMark days={days} today={today} dayPx={dayPx} />
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <GridMarks days={days} dayPx={dayPx} weekStart={weekStart} today={today} left={leftW} width={gridW} />
            <div style={{ position: 'relative', zIndex: 1 }}>
          {groups.map((group) => {
            const span = groupRange(group.tasks);
            const spanBar = span ? ganttBar(span.start, span.end) : null;
            const spanLayout = spanBar ? ganttBarLayout(spanBar, horizon.from, horizon.to, dayPx) : null;
            return (
              <div key={group.id}>
                <div style={{ display: 'flex', height: ROW_H, background: color.subtle, borderBottom: `1px solid ${color.divider}` }}>
                  <div className="bt-gantt-label" style={{ width: leftW, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', fontSize: 12.5, fontWeight: 600, background: color.subtle }}>
                    {group.name}
                    <span style={{ fontWeight: 500, color: color.muted }}>{group.tasks.length}</span>
                  </div>
                  <div
                    role={canWrite ? 'button' : undefined}
                    tabIndex={canWrite ? 0 : undefined}
                    aria-label={canWrite ? `Add task on ${group.name}` : undefined}
                    onClick={(event) => openAddFromGrid(event, `group:${group.id}`, sectionForGroup(group.id), parentForGroup(group.id))}
                    style={{ position: 'relative', width: gridW, flex: 'none', cursor: canWrite ? 'pointer' : 'default' }}
                  >
                    {spanLayout && (
                      <div
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: 10,
                          left: spanLayout.left,
                          width: spanLayout.width,
                          height: 16,
                          borderRadius: radius.sm,
                          background: color.chip,
                        }}
                      />
                    )}
                    {addAnchor?.rowKey === `group:${group.id}` && (
                      <div aria-hidden="true" style={{ position: 'absolute', top: 8, left: addAnchor.left, width: addAnchor.width, height: 20, borderRadius: 999, background: color.chip }} />
                    )}
                  </div>
                </div>
                {group.tasks.filter((task) => ganttBar(task.startDate, task.dueDate).kind !== 'unscheduled').map((task) => {
                  const bar = ganttBar(task.startDate, task.dueDate);
                  const layout = ganttBarLayout(bar, horizon.from, horizon.to, dayPx);
                  const overdue = barOverdue(d, task, today);
                  const user = d.users.find((u) => u.id === task.assigneeId);
                  return (
                    <div key={task.key} style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${color.divider}` }}>
                      <button
                        type="button"
                        className="bt-gantt-label"
                        onClick={() => openTask(task.key)}
                        style={{
                          width: leftW,
                          flex: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '0 12px',
                          border: 0,
                          background: color.surface,
                          font: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                          minWidth: 0,
                        }}
                      >
                        <span className="bt-key">{task.key}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{task.title}</span>
                      </button>
                      <div
                        onClick={(event) => openAddFromGrid(event, task.key, task.sectionId, task.planningParentId ?? null)}
                        style={{ position: 'relative', width: gridW, flex: 'none', cursor: canWrite ? 'pointer' : 'default' }}
                      >
                        {addAnchor?.rowKey === task.key && (
                          <div aria-hidden="true" style={{ position: 'absolute', top: 8, left: addAnchor.left, width: addAnchor.width, height: 20, borderRadius: 999, background: color.chip, zIndex: 1 }} />
                        )}
                        {layout && (
                          <button
                            type="button"
                            className="bt-gantt-bar"
                            aria-label={`${task.key} ${task.title} ${rangeLabel(bar.start, bar.end)}`}
                            onPointerDown={() => setHoverKey(null)}
                            onClick={(event) => {
                              event.stopPropagation();
                              openTask(task.key);
                            }}
                            onPointerEnter={(event) => {
                              moveHover(event);
                              setHoverKey(task.key);
                            }}
                            onPointerMove={(event) => {
                              if (hoverKey === task.key) moveHover(event);
                            }}
                            onPointerLeave={() => { if (hoverKey === task.key) setHoverKey(null); }}
                            style={{
                              position: 'absolute',
                              top: 8,
                              left: layout.left,
                              width: Math.max(layout.width, 8),
                              height: 20,
                              padding: user && layout.width > 36 ? '0 22px 0 8px' : '0 8px',
                              border: 0,
                              borderRadius: 999,
                              background: overdue ? color.danger : color.brandFill,
                              color: color.brandOn,
                              cursor: 'pointer',
                              font: 'inherit',
                              fontSize: 11.5,
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              overflow: 'hidden',
                              zIndex: 3,
                            }}
                          >
                            {layout.width > 40 && (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                            )}
                          </button>
                        )}
                        {user && layout && layout.width > 28 && (
                          <span style={{ position: 'absolute', top: 7, left: layout.left + layout.width - 22, zIndex: 2, pointerEvents: 'none' }}>
                            <Avatar user={user} size={18} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
            </div>
          </div>
        </div>
      </div>

      {hoverTask && !isPhone && (
        <div
          ref={hoverTip}
          className="bt-gantt-hover-tip"
          role="dialog"
          aria-label="Task preview"
          style={{
            position: 'fixed',
            left: Math.min(hoverPos.current.x + 12, globalThis.innerWidth - 280),
            top: hoverPos.current.y + 12,
            zIndex: 50,
            width: 260,
            padding: 12,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            boxShadow: color.shadow,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          <span className="bt-key">{hoverTask.key}</span>
          <span style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600 }}>{hoverTask.title}</span>
          <span style={{ fontSize: 13, color: color.ink3 }}>{rangeLabel(hoverTask.startDate, hoverTask.dueDate)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar user={d.users.find((u) => u.id === hoverTask.assigneeId)} size={24} />
            {hoverTask.isBlocked && <span style={{ fontSize: 12, color: color.warning, fontWeight: 600 }}>Blocked</span>}
            {barOverdue(d, hoverTask, today) && <span style={{ fontSize: 12, color: color.danger, fontWeight: 600 }}>Overdue</span>}
          </span>
        </div>
      )}

      {addAnchor && (
        <GanttAddPopover
          anchor={addAnchor}
          detail={d}
          tasks={tasks.data}
          onClose={() => setAddAnchor(null)}
        />
      )}
    </div>
  );
}

function GridMarks({
  days,
  dayPx,
  weekStart,
  today,
  left,
  width,
}: {
  days: string[];
  dayPx: number;
  weekStart: 'monday' | 'sunday';
  today: string;
  left: number;
  width: number;
}) {
  const todayIndex = days.indexOf(today);
  return (
    <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left, width, pointerEvents: 'none', zIndex: 0 }}>
      {days.map((day, index) => {
        if (!isWeekend(day) && !isWeekTick(day, weekStart)) return null;
        return (
          <div
            key={day}
            className={isWeekend(day) ? 'bt-gantt-weekend' : undefined}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: index * dayPx,
              width: isWeekend(day) ? dayPx : 1,
              background: isWeekend(day) ? undefined : color.divider,
            }}
          />
        );
      })}
      {todayIndex >= 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: todayIndex * dayPx + dayPx / 2,
            width: 2,
            background: color.brand,
            zIndex: 1,
          }}
        />
      )}
    </div>
  );
}

function TodayMark({ days, today, dayPx }: { days: string[]; today: string; dayPx: number }) {
  const index = days.indexOf(today);
  if (index < 0) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: index * dayPx + dayPx / 2,
        width: 2,
        background: color.brand,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}

const zoomBtn = {
  width: 28,
  height: 28,
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  background: color.surface,
  color: color.ink,
  font: 'inherit',
  cursor: 'pointer' as const,
};
