// Screen 1 · My tasks. Assigned work only; ideas waiting for a decision sit on To approve.
import { Button, Checkbox, Segmented, Select, Skeleton, Switch } from 'antd';
import { useQueries } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspaceCatalog } from '../api/catalog';
import { api, qk, useMe, useMoveTask, useMyTasks, useProjects } from '../api/queries';
import type { Priority, ProjectDetail, Task } from '../api/types';
import { Avatar, StatusPill, TaskHints, TypeTag } from '../components/Chips';
import { useQuickAdd } from '../components/QuickAdd';
import { useStatusToast } from '../components/StatusToast';
import { useTaskParam } from '../components/useTaskParam';
import { GuestWelcome, MemberEmpty } from '../components/WelcomeInShell';
import { useIsPhone } from '../hooks/useIsPhone';
import { useVisibleWindow } from '../hooks/useVisibleWindow';
import { dueBucket, dueColor, dueLabel, dueTone, type DueBucket } from '../lib/dates';
import { readLastViewed, readMyTasksPrefs, writeMyTasksPrefs } from '../lib/lastViewed';
import { statusById } from '../lib/workflow';
import { color, priorityStyle, typeStyle } from '../theme/tokens';

const BUCKETS: { id: DueBucket; label: string; color: string }[] = [
  { id: 'overdue', label: 'Overdue', color: color.danger },
  { id: 'today', label: 'Today', color: color.brandStrong },
  { id: 'week', label: 'This week', color: color.ink },
  { id: 'later', label: 'Later', color: color.ink },
  { id: 'none', label: 'No date', color: color.muted },
];

type Tab = 'assigned' | 'approve' | 'created' | 'watching';

function sortTasks(list: Task[], prefs: ReturnType<typeof readMyTasksPrefs>) {
  return [...list].sort((a, b) => {
    if (prefs.sort === 'priority') return priorityStyle[a.priority].key.localeCompare(priorityStyle[b.priority].key);
    if (prefs.sort === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
    if (prefs.sort === 'project') return a.projectKey.localeCompare(b.projectKey) || a.title.localeCompare(b.title);
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  });
}

export function MyTasksScreen() {
  const me = useMe().data;
  const mine = useMyTasks();
  const catalog = useWorkspaceCatalog();
  const projects = useProjects().data ?? [];
  const quickAdd = useQuickAdd();
  const { openTask } = useTaskParam();
  const move = useMoveTask();
  const toast = useStatusToast();
  const [params] = useSearchParams();
  const isPhone = useIsPhone();

  const keys = [...new Set([
    ...(mine.data?.assigned ?? []),
    ...(mine.data?.approvals ?? []),
    ...(mine.data?.unassigned ?? []),
    ...(mine.data?.created ?? []),
    ...(mine.data?.watching ?? []),
  ].map((t) => t.projectKey))];
  const details = useQueries({ queries: keys.map((k) => ({ queryKey: qk.project(k), queryFn: () => api.getProject(k) })) });
  const detailOf = (key: string): ProjectDetail | undefined => details.find((d) => d.data?.project.key === key)?.data;
  const projectName = (key: string) => projects.find((p) => p.key === key)?.name ?? key;

  const [tab, setTab] = useState<Tab>('assigned');
  const [prefs, setPrefs] = useState(readMyTasksPrefs);
  const assignedCount = mine.data?.assigned.length ?? 0;
  const approvalCount = mine.data?.approvals.length ?? 0;
  const unassignedPool = mine.data?.unassigned ?? [];

  const list = useMemo(() => {
    const base =
      tab === 'created' ? (mine.data?.created ?? [])
      : tab === 'watching' ? (mine.data?.watching ?? [])
      : tab === 'approve' ? (mine.data?.approvals ?? [])
      : (mine.data?.assigned ?? []);
    const merged = tab === 'assigned' && prefs.showUnassigned
      ? [...base, ...unassignedPool.filter((t) => !base.some((a) => a.key === t.key))]
      : base;
    return sortTasks(merged.filter((t) => {
      if (!prefs.showUnassigned && !t.assigneeId) return false;
      if (prefs.projectKey && t.projectKey !== prefs.projectKey) return false;
      if (prefs.priority && t.priority !== prefs.priority) return false;
      if (tab === 'approve' && prefs.type && t.type !== prefs.type) return false;
      if (tab === 'approve' && prefs.reportedByMe && t.reporterId !== me?.user.id) return false;
      return true;
    }), prefs);
  }, [mine.data, tab, prefs, unassignedPool, me?.user.id]);

  const lastViewed = useMemo(() => {
    if (tab === 'approve') return [];
    const listKeys = new Set(list.map((t) => t.key));
    return readLastViewed(me?.user.id).filter((row) => listKeys.has(row.key));
  }, [me?.user.id, list, tab, mine.dataUpdatedAt, params.get('task')]);
  const lastViewedKeys = useMemo(() => new Set(lastViewed.map((row) => row.key)), [lastViewed]);
  const buckets = useMemo(
    () =>
      tab === 'approve'
        ? [{ id: 'all' as DueBucket, label: 'To approve', color: color.merged, list }]
        : prefs.sort === 'due'
        ? BUCKETS.map((b) => ({
            ...b,
            list: list.filter((t) => !lastViewedKeys.has(t.key) && dueBucket(t.dueDate) === b.id),
          })).filter((b) => b.list.length)
        : [{ id: 'all' as DueBucket, label: prefs.sort === 'priority' ? 'By priority' : prefs.sort === 'updated' ? 'Recently updated' : 'By project', color: color.ink, list: list.filter((t) => !lastViewedKeys.has(t.key)) }],
    [list, prefs.sort, lastViewedKeys, tab],
  );
  const { shown, sentinelRef, remaining } = useVisibleWindow(
    list.length,
    `${tab}|${prefs.projectKey}|${prefs.priority}|${prefs.sort}|${prefs.type}|${prefs.reportedByMe}|${prefs.showUnassigned}`,
  );
  const setPref = <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    writeMyTasksPrefs(next);
  };

  if (mine.isLoading) return <div className="bt-page"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  if (params.get('welcome') === 'guest') return <GuestWelcome />;

  let left = shown;
  const windowed = buckets.map((b) => {
    const slice = b.list.slice(0, Math.max(0, left));
    left -= slice.length;
    return { ...b, list: slice, total: b.list.length };
  }).filter((b) => b.list.length);

  const approve = (t: Task) =>
    move.mutate(
      { key: t.key, input: { toStatusId: 'approved' } },
      {
        onSuccess: () => toast.show({ text: <><strong>{t.key}</strong> moved to Approved.</>, onUndo: () => move.mutate({ key: t.key, input: { toStatusId: t.statusId, undo: true } }) }),
        onError: () => toast.show({ kind: 'error', text: 'Could not approve this idea.' }),
      },
    );

  const typeOptions = catalog.types.length
    ? catalog.types.map((item) => ({ value: item.slug, label: item.name }))
    : Object.entries(typeStyle).map(([value, style]) => ({ value, label: style.label }));

  const subtitle =
    tab === 'approve'
      ? `${list.length} waiting for your approval`
      : `${list.length} open`;

  return (
    <div className="bt-page" style={{ paddingTop: isPhone ? 8 : 32, gap: isPhone ? 12 : 22 }}>
      <div>
        <h1 className="bt-h1" style={{ fontSize: 26 }}>My tasks</h1>
        <p style={{ margin: '6px 0 0', color: color.muted, fontSize: 13.5 }}>
          {dayjs().format('dddd D MMMM')} · {subtitle}
        </p>
        <Segmented
          style={{ marginTop: 12 }}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { label: assignedCount ? `Assigned to me ${assignedCount}` : 'Assigned to me', value: 'assigned' },
            { label: approvalCount ? `To approve ${approvalCount}` : 'To approve', value: 'approve' },
            { label: 'Created by me', value: 'created' },
            { label: 'Watching', value: 'watching' },
          ]}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <Select
            aria-label="Project"
            allowClear
            placeholder="All projects"
            value={prefs.projectKey || undefined}
            onChange={(value) => setPref('projectKey', value ?? '')}
            style={{ minWidth: 180 }}
            options={projects.map((p) => ({ value: p.key, label: p.name }))}
          />
          {tab === 'approve' ? (
            <Select
              aria-label="Type"
              allowClear
              placeholder="Any type"
              value={prefs.type || undefined}
              onChange={(value) => setPref('type', value ?? '')}
              style={{ minWidth: 150 }}
              options={typeOptions}
            />
          ) : (
            <Select
              aria-label="Priority"
              allowClear
              placeholder="Any priority"
              value={prefs.priority || undefined}
              onChange={(value) => setPref('priority', value ?? '')}
              style={{ minWidth: 150 }}
              options={(Object.keys(priorityStyle) as Priority[]).map((p) => ({ value: p, label: priorityStyle[p].label }))}
            />
          )}
          <Select
            aria-label="Sort"
            value={prefs.sort}
            onChange={(value) => setPref('sort', value)}
            style={{ minWidth: 170 }}
            options={[
              { value: 'due', label: 'Due date' },
              { value: 'priority', label: 'Priority' },
              { value: 'updated', label: 'Last updated' },
              { value: 'project', label: 'Project' },
            ]}
          />
          {tab === 'approve' && (
            <Checkbox checked={prefs.reportedByMe} onChange={(e) => setPref('reportedByMe', e.target.checked)}>
              Reported by me
            </Checkbox>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: color.ink3 }}>
            <Switch size="small" checked={prefs.showUnassigned} onChange={(on) => setPref('showUnassigned', on)} />
            Show unassigned
          </label>
        </div>
      </div>

      {tab === 'assigned' && approvalCount > 0 && (
        <button
          type="button"
          onClick={() => setTab('approve')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            minHeight: 40,
            padding: '8px 14px',
            border: `1px solid ${color.brandBorder}`,
            borderRadius: 10,
            background: color.brandTint,
            color: color.brandStrong,
            font: 'inherit',
            fontSize: 13.5,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {approvalCount === 1 ? '1 item waiting for you to approve' : `${approvalCount} items waiting for you to approve`}
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>To approve</span>
        </button>
      )}

      {lastViewed.length > 0 && (
        <section className="bt-card">
          <div className="bt-group-head" style={{ color: color.ink }}>Last viewed <span style={{ color: color.muted, fontWeight: 500 }}>{lastViewed.length}</span></div>
          {lastViewed.map((row) => (
            <button
              key={row.key}
              type="button"
              className="bt-row"
              onClick={() => openTask(row.key, { title: row.title, projectKey: row.projectKey })}
              style={{ paddingLeft: 16, cursor: 'pointer' }}
            >
              <span className="bt-key">{row.key}</span>
              <span className="bt-row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
              <span style={{ fontSize: 12.5, color: color.muted, width: 150 }}>{projectName(row.projectKey)}</span>
            </button>
          ))}
        </section>
      )}

      {list.length === 0 && tab === 'assigned' && <MemberEmpty />}
      {list.length === 0 && tab === 'approve' && (
        <p style={{ margin: 0, color: color.muted, fontSize: 13.5 }}>Nothing waiting for your approval.</p>
      )}

      {windowed.map((b) => {
        const rows = b.list;
        return (
          <section key={b.id} className="bt-card">
            <div className="bt-group-head" style={{ color: b.color, background: color.surface }}>{b.label} <span style={{ color: color.muted, fontWeight: 500 }}>{b.total}</span></div>
            {rows.map((t) => {
              if (tab === 'approve') {
                return isPhone ? (
                  <div key={t.key} className="bt-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '10px 14px', minHeight: 0 }}>
                    <button type="button" onClick={() => openTask(t.key)} style={{ padding: 0, border: 0, background: 'transparent', font: 'inherit', fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, textAlign: 'left', cursor: 'pointer', color: color.ink }}>{t.title}</button>
                    <span style={{ display: 'flex', gap: 8, fontSize: 12, color: color.muted }}>
                      <span>{t.key}</span>
                      <span>{projectName(t.projectKey)}</span>
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="primary" loading={move.isPending && move.variables?.key === t.key} onClick={() => approve(t)} style={{ height: 44 }}>Approve</Button>
                      <Button onClick={() => openTask(t.key)} style={{ height: 44 }}>Reject…</Button>
                    </div>
                  </div>
                ) : (
                  <div key={t.key} className="bt-row" style={{ paddingLeft: 16 }}>
                    <span className="bt-key">{t.key}</span>
                    <button className="bt-row-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => openTask(t.key)}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      <TaskHints task={t} />
                    </button>
                    <TypeTag type={t.type} />
                    <span style={{ fontSize: 12.5, color: color.muted, width: 150 }}>{projectName(t.projectKey)}</span>
                    <Button size="small" type="primary" loading={move.isPending && move.variables?.key === t.key} onClick={() => approve(t)}>Approve</Button>
                    <Button size="small" onClick={() => openTask(t.key)}>Reject…</Button>
                  </div>
                );
              }
              const detail = detailOf(t.projectKey);
              const project = projects.find((p) => p.key === t.projectKey);
              const status = detail ? statusById(detail.workflow, t.statusId) : undefined;
              if (isPhone) {
                return (
                  <button
                    key={t.key}
                    type="button"
                    className="bt-row"
                    onClick={() => openTask(t.key)}
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '10px 14px', minHeight: 0, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, textAlign: 'left' }}>{t.title}</span>
                    <span style={{ display: 'flex', gap: 8, fontSize: 12, color: color.muted }}>
                      <span>{t.key}</span>
                      {status && <span>{status.name}</span>}
                      <span style={{ marginLeft: 'auto', color: dueColor[dueTone(t.dueDate)], fontWeight: dueTone(t.dueDate) === 'normal' ? 400 : 600 }}>{dueLabel(t.dueDate)}</span>
                    </span>
                  </button>
                );
              }
              return (
                <div key={t.key} className="bt-row" style={{ paddingLeft: 16 }}>
                  <span className="bt-key">{t.key}</span>
                  <button className="bt-row-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => openTask(t.key)}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <TaskHints task={t} />
                  </button>
                  <TypeTag type={t.type} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 150, fontSize: 12.5, color: color.ink3 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: project?.color ?? color.faint }} />
                    {projectName(t.projectKey)}
                  </span>
                  <span style={{ width: 150 }}>{detail && <StatusPill status={status} />}</span>
                  <span style={{ width: 90, textAlign: 'right', fontSize: 12.5, color: dueColor[dueTone(t.dueDate)], fontWeight: dueTone(t.dueDate) === 'normal' ? 400 : 600 }}>{dueLabel(t.dueDate)}</span>
                </div>
              );
            })}
          </section>
        );
      })}

      {remaining > 0 && (
        <div ref={sentinelRef} style={{ padding: '4px 4px 0', fontSize: 12.5, color: color.muted }}>
          Showing {shown} of {list.length} tasks
        </div>
      )}

      {!isPhone && !(list.length === 0 && tab === 'assigned') && tab !== 'approve' && (
      <button
        onClick={() => quickAdd.open()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', border: `1px dashed ${color.dashed}`, borderRadius: 12, background: 'transparent', color: color.muted, font: 'inherit', fontSize: 13.5, cursor: 'pointer' }}
      >
        + Add a task <span style={{ marginLeft: 'auto', fontSize: 12 }}>or press <kbd className="bt-kbd">Q</kbd> anywhere</span>
      </button>
      )}
      {me && <span className="bt-sr-only"><Avatar user={me.user} /></span>}
    </div>
  );
}
