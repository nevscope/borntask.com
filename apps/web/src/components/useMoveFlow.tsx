// One place that decides what happens when someone moves a task (drag, status menu, quick buttons):
//   allowed            → move straight away
//   needs a comment    → small dialog first (e.g. Fail, Reject)
//   not allowed        → card stays put; message offers "Ask <role>" and, for leads/admins, "Override…"
import { Button, Input, Modal } from 'antd';
import { useState, type ReactNode } from 'react';
import { useAddComment, useMe, useMoveTask } from '../api/queries';
import type { ProjectDetail, ProjectRole, Task } from '../api/types';
import { canOverride, checkMove, rolesLabel, statusById } from '../lib/workflow';
import { color } from '../theme/tokens';
import { useStatusToast } from './StatusToast';

interface Pending {
  task: Task;
  toStatusId: string;
  mode: 'comment' | 'override';
  title: string;
}

interface BlockedState {
  task: Task;
  toStatusId: string;
  fromName: string;
  toName: string;
  roles: ProjectRole[];
}

export function useMoveFlow(detail: ProjectDetail | undefined, options?: { board?: boolean }) {
  const toast = useStatusToast();
  const me = useMe().data;
  const move = useMoveTask();
  const addComment = useAddComment();
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const [blocked, setBlocked] = useState<BlockedState | null>(null);

  const myRoles: ProjectRole[] = detail?.members.find((m) => m.userId === me?.user.id)?.roles ?? [];
  const mayOverride = me ? canOverride(me.workspaceRole, myRoles) : false;

  function run(task: Task, toStatusId: string, extra: { comment?: string; overrideReason?: string }) {
    const to = detail ? statusById(detail.workflow, toStatusId) : undefined;
    move.mutate(
      { key: task.key, input: { toStatusId, ...extra } },
      {
        onSuccess: () => {
          const assignee = detail?.users.find((user) => user.id === task.assigneeId);
          const notified = assignee && assignee.id !== me?.user.id ? ` ${assignee.name} was notified.` : '';
          const fromStatusId = task.statusId;
          toast.show({
            text: <><strong>{task.key}</strong> moved to {to?.name ?? toStatusId}.{notified}</>,
            onUndo: () => {
              move.mutate(
                { key: task.key, input: { toStatusId: fromStatusId, undo: true } },
                { onError: () => toast.show({ kind: 'error', text: 'Could not undo.' }) },
              );
            },
          });
        },
        onError: () => toast.show({ kind: 'error', text: 'Could not move this task.' }),
      },
    );
  }

  function askPeople(task: Task, roles: ProjectRole[], toName: string) {
    if (!detail) return;
    const names = detail.members
      .filter((m) => m.roles.some((r) => roles.includes(r)) && m.userId !== me?.user.id)
      .map((m) => detail.users.find((u) => u.id === m.userId)?.name.split(' ')[0])
      .filter(Boolean);
    const mentions = names.map((n) => `@${n}`).join(' ');
    addComment.mutate(
      { key: task.key, body: `${mentions} could you move this to ${toName}?` },
      { onSuccess: () => toast.show(`Asked ${names.join(' and ') || 'the team'} on ${task.key}`) },
    );
  }

  function requestMove(task: Task, toStatusId: string) {
    if (!detail || task.statusId === toStatusId) return;
    const wf = detail.workflow;
    const to = statusById(wf, toStatusId);
    const from = statusById(wf, task.statusId);
    const check = checkMove(wf, task, toStatusId, myRoles);

    if (check.kind === 'no-path') {
      toast.show({ kind: 'error', text: `${task.key} can't go from ${from?.name} straight to ${to?.name}.` });
      return;
    }
    if (check.kind === 'not-allowed') {
      if (options?.board) {
        setBlocked({
          task,
          toStatusId,
          fromName: from?.name ?? 'its current stage',
          toName: to?.name ?? 'that stage',
          roles: check.transition.roles,
        });
        return;
      }
      toast.show({
        kind: 'plain',
        text: `${task.key} stays in ${from?.name}. Only ${rolesLabel(check.transition.roles)} can move tasks to ${to?.name}.`,
        actions: [
          { label: `Ask ${rolesLabel(check.transition.roles).toLowerCase()}`, onClick: () => askPeople(task, check.transition.roles, to?.name ?? '') },
          ...(mayOverride
            ? [{ label: 'Override…', onClick: () => { setText(''); setPending({ task, toStatusId, mode: 'override', title: `Override: move ${task.key} to ${to?.name}` }); } }]
            : []),
        ],
        durationMs: 10000,
      });
      return;
    }
    if (check.transition.requireComment) {
      setText('');
      setPending({ task, toStatusId, mode: 'comment', title: `${check.transition.label ?? 'Move'} ${task.key}: add a comment` });
      return;
    }
    run(task, toStatusId, {});
  }

  const modal: ReactNode = (
    <>
    {options?.board && blocked && (
      <div role="status" className="bt-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong>{blocked.task.key} stays in {blocked.fromName}.</strong>
        <span style={{ fontSize: 13.5, color: color.ink3 }}>Only {rolesLabel(blocked.roles)} can move tasks to {blocked.toName}.</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" type="primary" onClick={() => { const current = blocked; setBlocked(null); askPeople(current.task, current.roles, current.toName); }}>
            Ask {rolesLabel(blocked.roles).toLowerCase()}
          </Button>
          {mayOverride && (
            <Button size="small" onClick={() => { setText(''); setPending({ task: blocked.task, toStatusId: blocked.toStatusId, mode: 'override', title: `Override: move ${blocked.task.key} to ${blocked.toName}` }); setBlocked(null); }}>
              Override…
            </Button>
          )}
          <Button size="small" onClick={() => setBlocked(null)}>Dismiss</Button>
        </div>
      </div>
    )}
    <Modal
      open={pending !== null}
      title={pending?.title}
      okText={pending?.mode === 'override' ? 'Override and move' : 'Move'}
      okButtonProps={{ disabled: !text.trim() }}
      onCancel={() => setPending(null)}
      onOk={() => {
        if (!pending) return;
        run(pending.task, pending.toStatusId, pending.mode === 'override' ? { overrideReason: text.trim() } : { comment: text.trim() });
        setPending(null);
      }}
    >
      <Input.TextArea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={pending?.mode === 'override' ? 'Why are you overriding the workflow? This is logged.' : 'What should the assignee know?'}
      />
    </Modal>
    </>
  );

  return { requestMove, myRoles, mayOverride, modal, moving: move.isPending };
}
