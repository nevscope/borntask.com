// Task detail (screen 4). Opens over any screen from ?task=KEY.
// Everything edits in place and saves on its own; the header shows Saving… / Saved.
import { Button, Checkbox, Drawer, Input, Select, Skeleton } from 'antd';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  useAddComment,
  useAddSubtask,
  useDeleteTask,
  useMe,
  useProject,
  useProjectTasks,
  useRestoreTask,
  useSetSubtaskDone,
  useTask,
  useUpdateTask,
  qk,
} from '../api/queries';
import type { ActorVia, ProjectDetail, TaskDetail, UpdateTaskInput } from '../api/types';
import { moveOptions, statusById } from '../lib/workflow';
import { color, font, radius } from '../theme/tokens';
import { BASE_URL } from '../api/http';
import { readTaskAttachments, writeTaskAttachments } from '../lib/attachmentSession';
import { deleteTaskFile, downloadTaskFile, uploadTaskFile } from '../lib/uploadAttachment';
import { persistDescription } from '../lib/descriptionHtml';
import { trashToldCopy } from '../lib/toldPeople';
import { DevelopmentSection } from './DevelopmentSection';
import { AttachmentTiles, filesFromClipboard } from './AttachmentTiles';
import { DescriptionEditor } from './DescriptionEditor';
import { ConfirmDialog } from './ConfirmDialog';
import { Avatar } from './Chips';
import { AssigneePicker, DuePicker, LabelPicker, PriorityPicker, StatusMenu, TypePicker } from './FieldPickers';
import { useMoveFlow } from './useMoveFlow';
import { useStatusToast } from './StatusToast';
import { useTaskParam } from './useTaskParam';
import { setLiveDrawerGuard } from '../lib/liveDrawer';

type CloseGuard = {
  dirty: boolean;
  flush: () => void;
};

export function TaskDrawer() {
  const { taskKey, closeTask } = useTaskParam();
  const projectKey = taskKey?.split('-')[0] ?? '';
  const task = useTask(taskKey);
  const detail = useProject(projectKey);
  const guard = useRef<CloseGuard>({ dirty: false, flush: () => {} });
  const [discardOpen, setDiscardOpen] = useState(false);

  function requestClose() {
    guard.current.flush();
    if (guard.current.dirty) {
      setDiscardOpen(true);
      return;
    }
    closeTask();
  }

  function discardAndClose() {
    setDiscardOpen(false);
    closeTask();
  }

  return (
    <>
      <Drawer open={!!taskKey} onClose={requestClose} maskClosable={false} width={600} closable={false} styles={{ body: { padding: 0 } }} destroyOnHidden>
        {task.data && detail.data ? (
          <DrawerBody key={task.data.key} task={task.data} detail={detail.data} onClose={requestClose} closeNow={closeTask} guard={guard} />
        ) : task.isError ? (
          <div style={{ padding: 32 }}>
            <h2 className="bt-h1" style={{ fontSize: 20 }}>{taskKey} doesn't exist or was deleted</h2>
            <p style={{ color: '#5B6157' }}>Deleted tasks stay in the project's Trash for 30 days.</p>
            <Link to="/" onClick={closeTask} style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 14px', marginTop: 4, border: `1px solid ${color.border}`, borderRadius: 8, color: color.ink3, textDecoration: 'none', fontSize: 13 }}>Back to My tasks</Link>
          </div>
        ) : (
          <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
        )}
      </Drawer>
      <ConfirmDialog
        open={discardOpen}
        title="Discard unsent text?"
        cancelLabel="Stay"
        confirmLabel="Discard"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={discardAndClose}
      >
        Your comment or subtask has not been added yet.
      </ConfirmDialog>
    </>
  );
}

function DrawerBody({ task, detail, onClose, closeNow, guard }: { task: TaskDetail; detail: ProjectDetail; onClose: () => void; closeNow: () => void; guard: RefObject<CloseGuard> }) {
  const toast = useStatusToast();
  const qc = useQueryClient();
  const me = useMe().data;
  const update = useUpdateTask();
  const del = useDeleteTask();
  const restore = useRestoreTask();
  const flow = useMoveFlow(detail);
  const saving = useIsMutating() > 0;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const savedDescription = useRef(task.description);
  const [files, setFiles] = useState(() => {
    if (task.attachments?.length) {
      return task.attachments.map((att) => ({
        id: att.id,
        name: att.name,
        size: att.size,
        mime: att.mime,
        previewUrl: att.mime.startsWith('image/') && att.url ? `${BASE_URL}${att.url}` : undefined,
      }));
    }
    return readTaskAttachments(task.key);
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [descFocused, setDescFocused] = useState(false);
  const [remoteNotice, setRemoteNotice] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    return () => {
      guard.current = { dirty: false, flush: () => {} };
    };
  }, [guard]);

  useEffect(() => {
    setLiveDrawerGuard({
      taskKey: task.key,
      actorId: me?.user.id,
      isDirty: () => descFocused || title.trim() !== task.title,
      onRemoteChange: () => setRemoteNotice(true),
    });
    return () => setLiveDrawerGuard(null);
  }, [task.key, task.title, title, descFocused, me?.user.id]);

  useEffect(() => {
    if (remoteNotice || descFocused) return;
    setTitle(task.title);
  }, [task.title, remoteNotice, descFocused]);

  useEffect(() => {
    if (remoteNotice || descFocused) return;
    setDescription(task.description);
    savedDescription.current = task.description;
  }, [task.description, remoteNotice, descFocused]);

  const setAttachments = (next: typeof files) => {
    setFiles(next);
    writeTaskAttachments(task.key, next);
  };

  async function addTaskFiles(list: File[] | FileList) {
    const added = Array.from(list);
    if (!added.length) return;
    try {
      const next = [...files];
      for (const file of added) {
        next.push(await uploadTaskFile(task.key, file));
      }
      setAttachments(next);
    } catch {
      toast.show({ kind: 'error', text: 'Could not attach that file.' });
    }
  }

  const wf = detail.workflow;
  const status = statusById(wf, task.statusId);
  const section = detail.sections.find((s) => s.id === task.sectionId);
  const options = moveOptions(wf, task, flow.myRoles);
  const quick = options
    .filter((o) => o.check.kind === 'allowed')
    .sort((a, b) => Number(a.status.side) - Number(b.status.side))
    .slice(0, 3);
  const memberUsers = detail.users.filter((u) => detail.members.some((m) => m.userId === u.id));
  const labelSuggestions = [...new Set((useProjectTasks(detail.project.key).data ?? []).flatMap((row) => row.labels))];
  const businessNames = detail.members
    .filter((m) => m.roles.includes('business') && m.userId !== me?.user.id)
    .map((m) => detail.users.find((u) => u.id === m.userId)?.name)
    .filter(Boolean)
    .join(' or ');
  const canDecide = flow.myRoles.includes('business');
  function toldNames() {
    const ids = [task.assigneeId, task.reporterId, ...(task.watcherIds ?? [])].filter(
      (id): id is string => Boolean(id) && id !== me?.user.id,
    );
    return [...new Set(ids)].map((id) => detail.users.find((user) => user.id === id)?.name).filter((name): name is string => Boolean(name));
  }

  const inTrash = Boolean(task.deletedAt);
  const save = (input: UpdateTaskInput) => {
    if (inTrash) return;
    update.mutate({ key: task.key, input });
  };

  guard.current = {
    dirty: commentDraft.trim() !== '' || subtaskDraft.trim() !== '',
    flush: () => {
      const next = title.trim();
      if (next && next !== task.title) save({ title: next });
    },
  };

  function persistDesc(next: string) {
    const html = persistDescription(next);
    setDescription(html);
    if (html === savedDescription.current) return;
    savedDescription.current = html;
    save({ description: html });
  }

  function remove() {
    if (task.subtasks.length > 0) {
      setConfirmDelete(true);
      return;
    }
    doDelete();
  }

  function doDelete() {
    setConfirmDelete(false);
    del.mutate(task.key, {
      onSuccess: () => {
        closeNow();
        toast.show({
          text: <><strong>{task.key}</strong> moved to Trash</>,
          onUndo: () => restore.mutate(task.key),
          showShortcut: true,
          durationMs: 10000,
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
            }).then(() => toast.show("You're watching this task."));
          }}
        >
          Watch
        </Button>
        <Button type="text" size="small" onClick={() => { void navigator.clipboard?.writeText(window.location.href); toast.show('Link copied.'); }}>Copy link</Button>
        <button type="button" aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', border: 0, borderRadius: radius.md, background: 'transparent', color: color.ink3, cursor: 'pointer', font: 'inherit', fontSize: 18 }}>×</button>
      </div>

      {remoteNotice && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 24px 0', padding: '10px 14px', borderRadius: 10, background: color.infoTint, border: `1px solid ${color.infoBorder}`, color: color.info, fontSize: 13.5 }}>
          <span style={{ flex: 1 }}>Someone else changed this task.</span>
          <Button
            size="small"
            onClick={() => {
              setRemoteNotice(false);
              setDescFocused(false);
              void qc.invalidateQueries({ queryKey: qk.task(task.key) }).then(() => {
                const latest = qc.getQueryData<TaskDetail>(qk.task(task.key));
                if (latest) {
                  setTitle(latest.title);
                  setDescription(latest.description);
                  savedDescription.current = latest.description;
                }
                setEditorKey((n) => n + 1);
              });
            }}
            style={{ height: 30, padding: '0 10px', border: 0, borderRadius: 7, background: color.surface, color: color.info, fontWeight: 600 }}
          >
            Show latest
          </Button>
        </div>
      )}

      {inTrash && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, margin: '16px 24px 0', padding: '12px 14px', borderRadius: 10, background: color.warningTint, border: `1px solid ${color.warningBorder}`, color: color.warning, fontSize: 13.5 }}>
          <span style={{ flex: '1 1 220px' }}>This task is in Trash. Restore it to keep working on it. It is removed after 30 days.</span>
          <Button size="small" type="primary" loading={restore.isPending} onClick={() => restore.mutate(task.key)}>Restore</Button>
        </div>
      )}

      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          variant="borderless"
          value={title}
          aria-label="Task title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          onPressEnter={(e) => e.currentTarget.blur()}
          style={{ fontFamily: font.display, fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', background: color.subtle, borderRadius: radius.md, padding: '4px 8px' }}
        />

        {task.statusId === 'idea' && !inTrash && (
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

        {!inTrash && <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <StatusMenu name={status?.name ?? task.statusId} dot={null} options={options} onMove={(statusId) => flow.requestMove(task, statusId)} />
          {task.statusId !== 'idea' && quick.length > 0 && <span style={{ fontSize: 12.5, color: color.muted }}>You can:</span>}
          {task.statusId !== 'idea' && quick.map((o, i) => (
            <Button key={o.status.id} type={i === 0 && !o.status.side ? 'primary' : 'default'} onClick={() => flow.requestMove(task, o.status.id)}>
              {o.check.kind === 'allowed' && o.check.transition.label && !o.status.side ? `${o.check.transition.label} · ${o.status.name}` : o.status.name}
            </Button>
          ))}
        </div>}

        <div style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', rowGap: 4, alignItems: 'center', fontSize: 13.5 }}>
          <FieldLabel>Type</FieldLabel>
          <TypePicker value={task.type} onChange={(type) => save({ type })} />
          <FieldLabel>Assignee</FieldLabel>
          <AssigneePicker value={task.assigneeId} users={memberUsers} detail={detail} meId={me?.user.id} onChange={(assigneeId) => save({ assigneeId })} />
          <FieldLabel>Due</FieldLabel>
          <DuePicker value={task.dueDate} onChange={(dueDate) => save({ dueDate })} />
          <FieldLabel>Priority</FieldLabel>
          <PriorityPicker value={task.priority} onChange={(priority) => save({ priority })} />
          <FieldLabel>Section</FieldLabel>
          <Select value={task.sectionId} onChange={(sectionId: string) => save({ sectionId })} options={detail.sections.map((s) => ({ value: s.id, label: s.name }))} style={{ height: 36 }} />
          <FieldLabel>Labels</FieldLabel>
          <LabelPicker value={task.labels} suggestions={labelSuggestions} onChange={(labels) => save({ labels })} />
          <FieldLabel>Reporter</FieldLabel>
          <span style={{ color: color.ink3 }}>{detail.users.find((u) => u.id === task.reporterId)?.name ?? 'Unknown'} · {dayjs(task.createdAt).format('D MMM')}</span>
        </div>

        <Section title="Description">
          <DescriptionEditor
            key={editorKey}
            value={description}
            people={memberUsers}
            minHeight={160}
            onChange={(next) => {
              setDescription(next);
              persistDesc(next);
            }}
            onFocusChange={setDescFocused}
            onBlur={(next) => persistDesc(next)}
          />
        </Section>

        <Section title="Attachments">
          <div
            onPaste={(e) => {
              const pasted = filesFromClipboard(e.clipboardData);
              if (pasted.length) {
                e.preventDefault();
                void addTaskFiles(pasted);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addTaskFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <AttachmentTiles
              items={files}
              onAdd={(added) => void addTaskFiles(added)}
              onOpen={(item) => void downloadTaskFile(task.key, item.id, item.name)}
              onRemove={(id) => {
                void deleteTaskFile(task.key, id)
                  .then(() => setAttachments(files.filter((x) => x.id !== id)))
                  .catch(() => toast.show({ kind: 'error', text: 'Could not remove that file.' }));
              }}
            />
          </div>
        </Section>

        <Subtasks task={task} onDraftChange={setSubtaskDraft} />
        <DevelopmentSection task={task} />
        <Comments task={task} detail={detail} onDraftChange={setCommentDraft} />

        {!inTrash && <Button danger type="text" style={{ alignSelf: 'flex-start' }} onClick={remove} loading={del.isPending}>Delete task</Button>}
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${task.key} and its ${task.subtasks.length} ${task.subtasks.length === 1 ? 'subtask' : 'subtasks'}?`}
          confirmLabel={`Move ${task.subtasks.length + 1} to Trash`}
          busy={del.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={doDelete}
        >
          {trashToldCopy(toldNames())}
        </ConfirmDialog>
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
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#5B6157', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
      {children}
    </section>
  );
}

function Subtasks({ task, onDraftChange }: { task: TaskDetail; onDraftChange: (value: string) => void }) {
  const add = useAddSubtask();
  const setDone = useSetSubtaskDone();
  const [draft, setDraft] = useState('');
  const write = (value: string) => {
    setDraft(value);
    onDraftChange(value);
  };
  return (
    <Section title={`Subtasks ${task.subtaskCount.done}/${task.subtaskCount.total}`}>
      {task.subtasks.map((s) => (
        <Checkbox key={s.id} checked={s.done} onChange={(e) => setDone.mutate({ key: task.key, id: s.id, done: e.target.checked })}>
          <span style={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? '#5B6157' : '#121417' }}>{s.title}</span>
        </Checkbox>
      ))}
      <Input
        value={draft}
        onChange={(e) => write(e.target.value)}
        onPressEnter={() => { if (draft.trim()) { add.mutate({ key: task.key, title: draft.trim() }); write(''); } }}
        placeholder="+ Add a subtask and press Enter"
        variant="filled"
      />
    </Section>
  );
}

function Comments({ task, detail, onDraftChange }: { task: TaskDetail; detail: ProjectDetail; onDraftChange: (value: string) => void }) {
  const add = useAddComment();
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const write = (value: string) => {
    setDraft(value);
    onDraftChange(value);
  };
  const send = () => {
    if (!draft.trim()) return;
    add.mutate({ key: task.key, body: draft.trim() }, { onSuccess: () => write('') });
  };
  const userOf = (id: string) => detail.users.find((u) => u.id === id);
  const feed = [
    ...task.comments.map((c) => ({ id: c.id, at: c.createdAt, who: userOf(c.authorId), text: c.body, kind: 'comment' as const, via: c.via })),
    ...task.activity.map((a) => ({ id: a.id, at: a.at, who: userOf(a.actorId), text: a.text, kind: 'activity' as const, via: a.via })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const shown = feed.filter((item) => (tab === 'comments' ? item.kind === 'comment' : item.kind === 'activity'));

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: `1px solid ${color.divider}`, paddingTop: 14 }}>
      <div role="tablist" style={{ display: 'flex', gap: 16, fontSize: 13.5 }}>
        <button type="button" role="tab" aria-selected={tab === 'comments'} onClick={() => setTab('comments')} style={{ height: 32, padding: 0, border: 0, borderBottom: tab === 'comments' ? `2px solid ${color.brand}` : '2px solid transparent', background: 'transparent', font: 'inherit', fontWeight: tab === 'comments' ? 600 : 400, color: tab === 'comments' ? color.ink : color.muted, cursor: 'pointer' }}>
          Comments {task.comments.length}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'activity'} onClick={() => setTab('activity')} style={{ height: 32, padding: 0, border: 0, borderBottom: tab === 'activity' ? `2px solid ${color.brand}` : '2px solid transparent', background: 'transparent', font: 'inherit', fontWeight: tab === 'activity' ? 600 : 400, color: tab === 'activity' ? color.ink : color.muted, cursor: 'pointer' }}>
          Activity
        </button>
      </div>
      {shown.map((item) =>
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
            {item.who?.name} {item.text}{item.via !== 'app' ? ` · via ${viaLabel(item.via)}` : ''} · {dayjs(item.at).format('D MMM HH:mm')}
          </div>
        ),
      )}
      {tab === 'comments' && (
        <>
          <Input.TextArea
            value={draft}
            onChange={(e) => write(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
            autoSize={{ minRows: 2, maxRows: 8 }}
            placeholder="Write a comment. Type @ to mention someone."
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: color.muted }}><kbd className="bt-kbd">Ctrl</kbd> + <kbd className="bt-kbd">Enter</kbd> to send</span>
            <Button type="primary" onClick={send} loading={add.isPending} disabled={!draft.trim()}>Comment</Button>
          </div>
        </>
      )}
    </section>
  );
}

function viaLabel(via: ActorVia) {
  if (via === 'mcp') return 'Claude';
  if (via === 'github') return 'GitHub';
  if (via === 'automation') return 'automation';
  return 'import';
}
