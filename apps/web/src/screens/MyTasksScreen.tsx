// Screen 1 · My tasks. Ideas waiting for my decision first, then my tasks by due date.
import { Button, Segmented, Skeleton } from 'antd';
import { useQueries } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qk, useMe, useMoveTask, useMyTasks, useProjects } from '../api/queries';
import type { ProjectDetail, Task } from '../api/types';
import { Avatar, StatusPill, TaskHints, TypeTag } from '../components/Chips';
import { useQuickAdd } from '../components/QuickAdd';
import { useStatusToast } from '../components/StatusToast';
import { useTaskParam } from '../components/useTaskParam';
import { GuestWelcome, MemberEmpty } from '../components/WelcomeInShell';
import { useIsPhone } from '../hooks/useIsPhone';
import { useVisibleWindow } from '../hooks/useVisibleWindow';
import { dueBucket, dueColor, dueLabel, dueTone, type DueBucket } from '../lib/dates';
import { statusById } from '../lib/workflow';
import { color } from '../theme/tokens';

const BUCKETS: { id: DueBucket; label: string; color: string }[] = [
  { id: 'overdue', label: 'Overdue', color: color.danger },
  { id: 'today', label: 'Today', color: color.brandStrong },
  { id: 'week', label: 'This week', color: color.ink },
  { id: 'later', label: 'Later', color: color.ink },
  { id: 'none', label: 'No date', color: color.muted },
];

export function MyTasksScreen() {
  const me = useMe().data;
  const mine = useMyTasks();
  const projects = useProjects().data ?? [];
  const quickAdd = useQuickAdd();
  const { openTask } = useTaskParam();
  const move = useMoveTask();
  const toast = useStatusToast();
  const [params] = useSearchParams();
  const isPhone = useIsPhone();

  const keys = [...new Set([...(mine.data?.assigned ?? []), ...(mine.data?.approvals ?? [])].map((t) => t.projectKey))];
  const details = useQueries({ queries: keys.map((k) => ({ queryKey: qk.project(k), queryFn: () => api.getProject(k) })) });
  const detailOf = (key: string): ProjectDetail | undefined => details.find((d) => d.data?.project.key === key)?.data;
  const projectName = (key: string) => projects.find((p) => p.key === key)?.name ?? key;

  const [tab, setTab] = useState<'assigned' | 'created' | 'watching'>('assigned');
  const assigned = (tab === 'created' ? mine.data?.created : tab === 'watching' ? mine.data?.watching : mine.data?.assigned) ?? mine.data?.assigned ?? [];
  const approvals = tab === 'assigned' ? (mine.data?.approvals ?? []) : [];
  const buckets = useMemo(
    () =>
      BUCKETS.map((b) => ({
        ...b,
        list: assigned.filter((t) => dueBucket(t.dueDate) === b.id).sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? '')),
      })).filter((b) => b.list.length),
    [assigned],
  );
  const { shown, sentinelRef, remaining } = useVisibleWindow(assigned.length, tab);

  if (mine.isLoading) return <div className="bt-page"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  if (params.get('welcome') === 'guest') return <GuestWelcome />;

  let left = shown;
  const windowed = buckets.map((b) => {
    const list = b.list.slice(0, Math.max(0, left));
    left -= list.length;
    return { ...b, list, total: b.list.length };
  }).filter((b) => b.list.length);

  const approve = (t: Task) =>
    move.mutate(
      { key: t.key, input: { toStatusId: 'approved' } },
      {
        onSuccess: () => toast.show({ text: <><strong>{t.key}</strong> moved to Approved.</>, onUndo: () => move.mutate({ key: t.key, input: { toStatusId: t.statusId, undo: true } }) }),
        onError: () => toast.show({ kind: 'error', text: 'Could not approve this idea.' }),
      },
    );

  return (
    <div className="bt-page" style={{ maxWidth: 1100, margin: '0 auto', width: '100%', paddingTop: isPhone ? 8 : 32, gap: isPhone ? 12 : 22 }}>
      <div>
        <h1 className="bt-h1" style={{ fontSize: 26 }}>My tasks</h1>
        <p style={{ margin: '6px 0 0', color: color.muted, fontSize: 13.5 }}>
          {dayjs().format('dddd D MMMM')} · {assigned.length} open{approvals.length ? ` · ${approvals.length} waiting for your approval` : ''}
        </p>
        <Segmented
          style={{ marginTop: 12 }}
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { label: 'Assigned to me', value: 'assigned' },
            { label: 'Created by me', value: 'created' },
            { label: 'Watching', value: 'watching' },
          ]}
        />
      </div>

      {approvals.length > 0 && (
        <section className="bt-card">
          <div className="bt-group-head" style={{ color: color.merged }}>Needs your approval <span style={{ color: color.muted, fontWeight: 500 }}>{approvals.length}</span></div>
          {approvals.map((t) => (
            isPhone ? (
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
            )
          ))}
        </section>
      )}

      {assigned.length === 0 && approvals.length === 0 && tab === 'assigned' && <MemberEmpty />}

      {windowed.map((b) => {
        const list = b.list;
        return (
          <section key={b.id} className="bt-card">
            <div className="bt-group-head" style={{ color: b.color, background: color.surface }}>{b.label} <span style={{ color: color.muted, fontWeight: 500 }}>{b.total}</span></div>
            {list.map((t) => {
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
          Showing {shown} of {assigned.length} tasks
        </div>
      )}

      {!isPhone && !(assigned.length === 0 && approvals.length === 0 && tab === 'assigned') && (
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
