// One place that decides what happens when someone moves a task (drag, status menu, quick buttons):
//   allowed            → move straight away
//   needs a comment    → small dialog first (e.g. Fail, Reject)
//   not allowed        → card stays put; message offers "Ask <role>" and, for leads/admins, "Override…"
import { App, Button, Input, Modal } from 'antd';
import { useState, type ReactNode } from 'react';
import { useAddComment, useMe, useMoveTask } from '../api/queries';
import type { ProjectDetail, ProjectRole, Task } from '../api/types';
import { canOverride, checkMove, rolesLabel, statusById } from '../lib/workflow';

interface Pending {
  task: Task;
  toStatusId: string;
  mode: 'comment' | 'override';
  title: string;
}

export function useMoveFlow(detail: ProjectDetail | undefined) {
  const { message, notification } = App.useApp();
  const me = useMe().data;
  const move = useMoveTask();
  const addComment = useAddComment();
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');

  const myRoles: ProjectRole[] = detail?.members.find((m) => m.userId === me?.user.id)?.roles ?? [];
  const mayOverride = me ? canOverride(me.workspaceRole, myRoles) : false;

  function run(task: Task, toStatusId: string, extra: { comment?: string; overrideReason?: string }) {
    const to = detail ? statusById(detail.workflow, toStatusId) : undefined;
    move.mutate(
      { key: task.key, input: { toStatusId, ...extra } },
      {
        onSuccess: () => void message.success(`${task.key} moved to ${to?.name ?? toStatusId}`),
        onError: (e) => void notification.error({ message: 'Move failed', description: e.message }),
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
      { onSuccess: () => void message.success(`Asked ${names.join(' and ') || 'the team'} on ${task.key}`) },
    );
  }

  function requestMove(task: Task, toStatusId: string) {
    if (!detail || task.statusId === toStatusId) return;
    const wf = detail.workflow;
    const to = statusById(wf, toStatusId);
    const from = statusById(wf, task.statusId);
    const check = checkMove(wf, task, toStatusId, myRoles);

    if (check.kind === 'no-path') {
      void message.info(`${task.key} can't go from ${from?.name} straight to ${to?.name}.`);
      return;
    }
    if (check.kind === 'not-allowed') {
      const key = `blocked-${task.key}`;
      notification.warning({
        key,
        message: `Only ${rolesLabel(check.transition.roles)} can move tasks to ${to?.name}`,
        description: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span>{task.key} stays in {from?.name}.</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="small" type="primary" onClick={() => { notification.destroy(key); askPeople(task, check.transition.roles, to?.name ?? ''); }}>
                Ask {rolesLabel(check.transition.roles).toLowerCase()}
              </Button>
              {mayOverride && (
                <Button size="small" onClick={() => { notification.destroy(key); setText(''); setPending({ task, toStatusId, mode: 'override', title: `Override: move ${task.key} to ${to?.name}` }); }}>
                  Override…
                </Button>
              )}
            </div>
          </div>
        ),
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
  );

  return { requestMove, myRoles, mayOverride, modal, moving: move.isPending };
}
