// Screen 1 · My tasks. Ideas waiting for my decision first, then my tasks by due date.
import { Button, Segmented, Skeleton } from 'antd';
import { useQueries } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qk, useMe, useMoveTask, useMyTasks, useProjects } from '../api/queries';
import type { ProjectDetail, Task } from '../api/types';
import { Avatar, StatusPill, TypeTag } from '../components/Chips';
import { useQuickAdd } from '../components/QuickAdd';
import { useStatusToast } from '../components/StatusToast';
import { useTaskParam } from '../components/useTaskParam';
import { GuestWelcome, MemberEmpty } from '../components/WelcomeInShell';
import { dueBucket, dueColor, dueLabel, dueTone, type DueBucket } from '../lib/dates';
import { statusById } from '../lib/workflow';

const BUCKETS: { id: DueBucket; label: string; color: string }[] = [
  { id: 'overdue', label: 'Overdue', color: '#B42323' },
  { id: 'today', label: 'Today', color: '#0F6B46' },
  { id: 'week', label: 'This week', color: '#121417' },
  { id: 'later', label: 'Later', color: '#121417' },
  { id: 'none', label: 'No date', color: '#5B6157' },
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

  const keys = [...new Set([...(mine.data?.assigned ?? []), ...(mine.data?.approvals ?? [])].map((t) => t.projectKey))];
  const details = useQueries({ queries: keys.map((k) => ({ queryKey: qk.project(k), queryFn: () => api.getProject(k) })) });
  const detailOf = (key: string): ProjectDetail | undefined => details.find((d) => d.data?.project.key === key)?.data;
  const projectName = (key: string) => projects.find((p) => p.key === key)?.name ?? key;

  const [tab, setTab] = useState<'assigned' | 'created' | 'watching'>('assigned');
  if (mine.isLoading) return <div className="bt-page"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  if (params.get('welcome') === 'guest') return <GuestWelcome />;
  const assigned = (tab === 'created' ? mine.data?.created : tab === 'watching' ? mine.data?.watching : mine.data?.assigned) ?? mine.data?.assigned ?? [];
  const approvals = tab === 'assigned' ? (mine.data?.approvals ?? []) : [];

  const approve = (t: Task) =>
    move.mutate(
      { key: t.key, input: { toStatusId: 'approved' } },
      {
        onSuccess: () => toast.show({ text: <><strong>{t.key}</strong> moved to Approved.</>, onUndo: () => move.mutate({ key: t.key, input: { toStatusId: t.statusId, undo: true } }) }),
        onError: () => toast.show({ kind: 'error', text: 'Could not approve this idea.' }),
      },
    );

  return (
    <div className="bt-page" style={{ maxWidth: 1100, margin: '0 auto', width: '100%', paddingTop: 32, gap: 22 }}>
      <div>
        <h1 className="bt-h1" style={{ fontSize: 26 }}>My tasks</h1>
        <p style={{ margin: '6px 0 0', color: '#5B6157', fontSize: 13.5 }}>
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
          <div className="bt-group-head" style={{ color: '#5B3FC4' }}>Needs your approval <span style={{ color: '#5B6157', fontWeight: 500 }}>{approvals.length}</span></div>
          {approvals.map((t) => (
            <div key={t.key} className="bt-row" style={{ paddingLeft: 16 }}>
              <span className="bt-key">{t.key}</span>
              <button className="bt-row-title" onClick={() => openTask(t.key)}>{t.title}</button>
              <TypeTag type={t.type} />
              <span style={{ fontSize: 12.5, color: '#5B6157', width: 150 }}>{projectName(t.projectKey)}</span>
              <Button size="small" type="primary" loading={move.isPending && move.variables?.key === t.key} onClick={() => approve(t)}>Approve</Button>
              <Button size="small" onClick={() => openTask(t.key)}>Reject…</Button>
            </div>
          ))}
        </section>
      )}

      {assigned.length === 0 && approvals.length === 0 && tab === 'assigned' && <MemberEmpty />}

      {BUCKETS.map((b) => {
        const list = assigned.filter((t) => dueBucket(t.dueDate) === b.id).sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? ''));
        if (!list.length) return null;
        return (
          <section key={b.id} className="bt-card">
            <div className="bt-group-head" style={{ color: b.color, background: '#fff' }}>{b.label} <span style={{ color: '#5B6157', fontWeight: 500 }}>{list.length}</span></div>
            {list.map((t) => {
              const detail = detailOf(t.projectKey);
              const project = projects.find((p) => p.key === t.projectKey);
              return (
                <div key={t.key} className="bt-row" style={{ paddingLeft: 16 }}>
                  <span className="bt-key">{t.key}</span>
                  <button className="bt-row-title" onClick={() => openTask(t.key)}>{t.title}</button>
                  <TypeTag type={t.type} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 150, fontSize: 12.5, color: '#3A3F38' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: project?.color ?? '#AEB4AA' }} />
                    {projectName(t.projectKey)}
                  </span>
                  <span style={{ width: 150 }}>{detail && <StatusPill status={statusById(detail.workflow, t.statusId)} />}</span>
                  <span style={{ width: 90, textAlign: 'right', fontSize: 12.5, color: dueColor[dueTone(t.dueDate)], fontWeight: dueTone(t.dueDate) === 'normal' ? 400 : 600 }}>{dueLabel(t.dueDate)}</span>
                </div>
              );
            })}
          </section>
        );
      })}

      {!(assigned.length === 0 && approvals.length === 0 && tab === 'assigned') && (
      <button
        onClick={() => quickAdd.open()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', border: '1px dashed #CDD2C9', borderRadius: 12, background: 'transparent', color: '#5B6157', font: 'inherit', fontSize: 13.5, cursor: 'pointer' }}
      >
        + Add a task <span style={{ marginLeft: 'auto', fontSize: 12 }}>or press <kbd className="bt-kbd">Q</kbd> anywhere</span>
      </button>
      )}
      {me && <span className="bt-sr-only"><Avatar user={me.user} /></span>}
    </div>
  );
}
