// Task detail (screen 4). Opens over any screen from ?task=KEY.
// Everything edits in place and saves on its own; the header shows Saving… / Saved.
import { App, Button, Checkbox, DatePicker, Drawer, Dropdown, Input, Select, Skeleton } from 'antd';
import type { MenuProps } from 'antd';
import { useIsMutating } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState, type ReactNode } from 'react';
import {
  useAddComment,
  useAddSubtask,
  useDeleteTask,
  useMe,
  useProject,
  useRestoreTask,
  useSetSubtaskDone,
  useTask,
  useUpdateTask,
} from '../api/queries';
import type { Priority, ProjectDetail, TaskDetail, TaskType, UpdateTaskInput } from '../api/types';
import { moveOptions, statusById } from '../lib/workflow';
import { priorityStyle, typeStyle } from '../theme/tokens';
import { readTaskAttachments, writeTaskAttachments } from '../lib/attachmentSession';
import { AttachmentTiles, filesFromClipboard, itemsFromFiles } from './AttachmentTiles';
import { Avatar, LockIcon, StatusDot, StatusPill } from './Chips';
import { useMoveFlow } from './useMoveFlow';
import { useTaskParam } from './useTaskParam';

export function TaskDrawer() {
  const { taskKey, closeTask } = useTaskParam();
  const projectKey = taskKey?.split('-')[0] ?? '';
  const task = useTask(taskKey);
  const detail = useProject(projectKey);

  return (
    <Drawer open={!!taskKey} onClose={closeTask} width={600} closable={false} styles={{ body: { padding: 0 } }} destroyOnHidden>
      {task.data && detail.data ? (
        <DrawerBody key={task.data.key} task={task.data} detail={detail.data} onClose={closeTask} />
      ) : task.isError ? (
        <div style={{ padding: 32 }}>
          <h2 className="bt-h1" style={{ fontSize: 20 }}>{taskKey} doesn't exist or was deleted</h2>
          <p style={{ color: '#5B6157' }}>Deleted tasks stay in the project's Trash for 30 days.</p>
          <Button onClick={closeTask}>Close</Button>
        </div>
      ) : (
        <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
      )}
    </Drawer>
  );
}

function DrawerBody({ task, detail, onClose }: { task: TaskDetail; detail: ProjectDetail; onClose: () => void }) {
  const { message } = App.useApp();
  const me = useMe().data;
  const update = useUpdateTask();
  const del = useDeleteTask();
  const restore = useRestoreTask();
  const flow = useMoveFlow(detail);
  const saving = useIsMutating() > 0;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [files, setFiles] = useState(() => readTaskAttachments(task.key));

  const setAttachments = (next: typeof files) => {
    setFiles(next);
    writeTaskAttachments(task.key, next);
  };

  const wf = detail.workflow;
  const status = statusById(wf, task.statusId);
  const section = detail.sections.find((s) => s.id === task.sectionId);
  const options = moveOptions(wf, task, flow.myRoles);
  const quick = options.filter((o) => o.check.kind === 'allowed' && o.check.transition.label).slice(0, 3);
  const memberUsers = detail.users.filter((u) => detail.members.some((m) => m.userId === u.id));
  const businessNames = detail.members
    .filter((m) => m.roles.includes('business') && m.userId !== me?.user.id)
    .map((m) => detail.users.find((u) => u.id === m.userId)?.name)
    .filter(Boolean)
    .join(' or ');
  const canDecide = flow.myRoles.includes('business');

  const save = (input: UpdateTaskInput) => update.mutate({ key: task.key, input });

  const statusMenu: MenuProps = {
    items: options.map((o) => ({
      key: o.status.id,
      disabled: o.check.kind !== 'allowed',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 240 }}>
          <StatusDot status={o.status} />
          <span style={{ flex: 1 }}>{o.status.name}</span>
          <span style={{ fontSize: 12, color: '#5B6157' }}>
            {o.check.kind === 'allowed' ? o.check.transition.label ?? '' : o.check.kind === 'not-allowed' ? <><LockIcon /> {o.check.reason}</> : ''}
          </span>
        </span>
      ),
    })),
    onClick: ({ key }) => flow.requestMove(task, key),
  };

  function remove() {
    del.mutate(task.key, {
      onSuccess: () => {
        onClose();
        const k = `deleted-${task.key}`;
        void message.open({
          key: k,
          type: 'info',
          duration: 10,
          content: (
            <span>
              {task.key} moved to Trash{' '}
              <Button size="small" type="link" onClick={() => { message.destroy(k); restore.mutate(task.key); }}>Undo</Button>
            </span>
          ),
        });
      },
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {flow.modal}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderBottom: '1px solid #EEF0EC', fontSize: 12.5, color: '#5B6157' }}>
        <span>{detail.project.name}</span><span>/</span><span>{section?.name}</span><span>/</span>
        <strong style={{ color: '#121417' }}>{task.key}</strong>
        <span role="status" style={{ marginLeft: 6, color: saving ? '#5B6157' : '#0F6B46' }}>{saving ? 'Saving…' : '✓ Saved'}</span>
        <span style={{ flex: 1 }} />
        <Button
          type="text"
          size="small"
          onClick={() => {
            void fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/tasks/${encodeURIComponent(task.key)}/watchers`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ watch: true }),
            }).then(() => void message.success('Watching this task'));
          }}
        >
          Watch
        </Button>
        <Button type="text" size="small" onClick={() => { void navigator.clipboard?.writeText(window.location.href); void message.success('Link copied'); }}>Copy link</Button>
        <Button type="text" size="small" aria-label="Close" onClick={onClose}>✕</Button>
      </div>

      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          variant="filled"
          value={title}
          aria-label="Task title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          onPressEnter={(e) => e.currentTarget.blur()}
          style={{ fontFamily: 'var(--bt-display)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em' }}
        />

        {task.statusId === 'idea' && (
          canDecide ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 10, background: '#F4F1FD', border: '1px solid #E1D8F8' }}>
              <span style={{ fontSize: 13.5, color: '#3B2A80' }}><strong>Idea</strong> raised by {detail.users.find((u) => u.id === task.reporterId)?.name}. You can decide.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="primary" onClick={() => flow.requestMove(task, 'approved')}>Approve</Button>
                <Button onClick={() => flow.requestMove(task, 'rejected')}>Reject…</Button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#FAFBF9', border: '1px solid #EEF0EC', fontSize: 13.5, color: '#3A3F38' }}>
              Waiting for approval from <strong>{businessNames || 'Business'}</strong>. Work can start once it's approved.
            </div>
          )
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Dropdown menu={statusMenu} trigger={['click']}>
            <Button style={{ borderRadius: 999 }} aria-label={`Status: ${status?.name}. Change status`}>
              <StatusPill status={status} /> ▾
            </Button>
          </Dropdown>
          {task.statusId !== 'idea' && quick.length > 0 && <span style={{ fontSize: 12.5, color: '#5B6157' }}>You can:</span>}
          {task.statusId !== 'idea' && quick.map((o, i) => (
            <Button key={o.status.id} type={i === 0 ? 'primary' : 'default'} onClick={() => flow.requestMove(task, o.status.id)}>
              {o.check.kind === 'allowed' ? o.check.transition.label : ''} · {o.status.name}
            </Button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', rowGap: 8, alignItems: 'center', fontSize: 13.5 }}>
          <FieldLabel>Type</FieldLabel>
          <Select<TaskType> value={task.type} onChange={(type) => save({ type })} options={(Object.keys(typeStyle) as TaskType[]).map((t) => ({ value: t, label: typeStyle[t].label }))} />
          <FieldLabel>Assignee</FieldLabel>
          <Select
            value={task.assigneeId ?? '__none'}
            onChange={(v: string) => save({ assigneeId: v === '__none' ? null : v })}
            options={[{ value: '__none', label: 'Unassigned' }, ...memberUsers.map((u) => ({ value: u.id, label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar user={u} size={20} />{u.name}</span> }))]}
          />
          <FieldLabel>Due</FieldLabel>
          <DatePicker
            value={task.dueDate ? dayjs(task.dueDate) : null}
            onChange={(d) => save({ dueDate: d ? d.format('YYYY-MM-DD') : null })}
            format="ddd D MMM YYYY"
            style={{ width: '100%' }}
          />
          <FieldLabel>Priority</FieldLabel>
          <Select<Priority>
            value={task.priority}
            onChange={(priority) => save({ priority })}
            options={(Object.keys(priorityStyle) as Priority[]).map((p) => ({ value: p, label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: priorityStyle[p].color }} />{priorityStyle[p].label}</span> }))}
          />
          <FieldLabel>Section</FieldLabel>
          <Select value={task.sectionId} onChange={(sectionId: string) => save({ sectionId })} options={detail.sections.map((s) => ({ value: s.id, label: s.name }))} />
          <FieldLabel>Labels</FieldLabel>
          <Select mode="tags" value={task.labels} onChange={(labels: string[]) => save({ labels })} placeholder="Add labels" />
        </div>

        <Section title="Description">
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== task.description && save({ description })}
            autoSize={{ minRows: 5, maxRows: 18 }}
            placeholder="Add details. Markdown and @mentions work here."
          />
        </Section>

        <Section title="Attachments">
          <div
            onPaste={(e) => {
              const pasted = filesFromClipboard(e.clipboardData);
              if (pasted.length) {
                e.preventDefault();
                setAttachments([...files, ...itemsFromFiles(pasted)]);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setAttachments([...files, ...itemsFromFiles(e.dataTransfer.files)]);
            }}
          >
            <AttachmentTiles
              items={files}
              onAdd={(added) => setAttachments([...files, ...itemsFromFiles(added)])}
              onRemove={(id) => setAttachments(files.filter((x) => x.id !== id))}
            />
          </div>
        </Section>

        <Subtasks task={task} />
        <Comments task={task} detail={detail} />

        <Button danger type="text" style={{ alignSelf: 'flex-start' }} onClick={remove} loading={del.isPending}>Delete task</Button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span style={{ color: '#5B6157' }}>{children}</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#5B6157', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
      {children}
    </section>
  );
}

function Subtasks({ task }: { task: TaskDetail }) {
  const add = useAddSubtask();
  const setDone = useSetSubtaskDone();
  const [draft, setDraft] = useState('');
  return (
    <Section title={`Subtasks ${task.subtaskCount.done}/${task.subtaskCount.total}`}>
      {task.subtasks.map((s) => (
        <Checkbox key={s.id} checked={s.done} onChange={(e) => setDone.mutate({ key: task.key, id: s.id, done: e.target.checked })}>
          <span style={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? '#5B6157' : '#121417' }}>{s.title}</span>
        </Checkbox>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={() => { if (draft.trim()) { add.mutate({ key: task.key, title: draft.trim() }); setDraft(''); } }}
        placeholder="+ Add a subtask and press Enter"
        variant="filled"
      />
    </Section>
  );
}

function Comments({ task, detail }: { task: TaskDetail; detail: ProjectDetail }) {
  const add = useAddComment();
  const [draft, setDraft] = useState('');
  const send = () => {
    if (!draft.trim()) return;
    add.mutate({ key: task.key, body: draft.trim() }, { onSuccess: () => setDraft('') });
  };
  const userOf = (id: string) => detail.users.find((u) => u.id === id);
  const feed = [
    ...task.comments.map((c) => ({ id: c.id, at: c.createdAt, who: userOf(c.authorId), text: c.body, kind: 'comment' as const, via: c.via })),
    ...task.activity.map((a) => ({ id: a.id, at: a.at, who: userOf(a.actorId), text: a.text, kind: 'activity' as const, via: a.via })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Section title={`Comments and activity`}>
      {feed.map((item) =>
        item.kind === 'comment' ? (
          <div key={item.id} style={{ display: 'flex', gap: 10 }}>
            <Avatar user={item.who} size={28} />
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              <strong>{item.who?.name}</strong> <span style={{ color: '#5B6157', fontSize: 12.5 }}>{dayjs(item.at).format('D MMM HH:mm')}</span>
              <div>{item.text}</div>
            </div>
          </div>
        ) : (
          <div key={item.id} style={{ fontSize: 12.5, color: '#5B6157', paddingLeft: 38 }}>
            {item.who?.name} {item.text}{item.via !== 'app' ? ` · via ${item.via === 'mcp' ? 'Claude' : item.via === 'github' ? 'GitHub' : 'import'}` : ''} · {dayjs(item.at).format('D MMM HH:mm')}
          </div>
        ),
      )}
      <Input.TextArea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
        autoSize={{ minRows: 2, maxRows: 8 }}
        placeholder="Write a comment. Type @ to mention someone."
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#5B6157' }}><kbd className="bt-kbd">Ctrl</kbd> + <kbd className="bt-kbd">Enter</kbd> to send</span>
        <Button type="primary" onClick={send} loading={add.isPending} disabled={!draft.trim()}>Comment</Button>
      </div>
    </Section>
  );
}
