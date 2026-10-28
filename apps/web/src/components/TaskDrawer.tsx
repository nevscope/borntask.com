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
  useCopyTask,
  useDeleteComment,
  useDeleteTask,
  useMe,
  useProject,
  useProjectTasks,
  useRestoreTask,
  useSetSubtaskDone,
  useSetWatching,
  useTask,
  useUpdateComment,
  useUpdateTask,
  useMoveTaskToProject,
  qk,
} from '../api/queries';
import type { ActorVia, Comment, ProjectDetail, TaskDetail, UpdateTaskInput, WorkspaceRole } from '../api/types';
import { moveOptions, statusById } from '../lib/workflow';
import { color, font, radius } from '../theme/tokens';
import { BASE_URL } from '../api/http';
import { readTaskAttachments, writeTaskAttachments } from '../lib/attachmentSession';
import { blobUrlForTaskFile, canPreviewAttachment, deleteTaskFile, downloadTaskFile, uploadTaskFile } from '../lib/uploadAttachment';
import { isTaskDescriptionTooLong, partitionAttachmentFiles, TASK_DESCRIPTION_TOO_LONG } from '@borntask/shared';
import { useWorkspaceCatalog } from '../api/catalog';
import { isEmptyDescription, persistDescription, readableDescriptionHtml } from '../lib/descriptionHtml';
import { allowedTypeSlugs } from '../lib/taskFilters';
import { trashToldCopy } from '../lib/toldPeople';
import { DevelopmentSection } from './DevelopmentSection';
import { AttachmentPreview, AttachmentTiles, filesFromClipboard, type AttachmentItem } from './AttachmentTiles';
import { DescriptionEditor } from './DescriptionEditor';
import { useMentionInvite } from './useMentionInvite';
import { ConfirmDialog } from './ConfirmDialog';
import { MoveToProjectDialog } from './MoveToProjectDialog';
import { Avatar, StatusPill, TypeTag } from './Chips';
import { AssigneePicker, DuePicker, LabelPicker, PriorityPicker, StatusMenu, TypePicker } from './FieldPickers';
import { useMoveFlow } from './useMoveFlow';
import { useStatusToast } from './StatusToast';
import { useTaskParam } from './useTaskParam';
import { setLiveDrawerGuard } from '../lib/liveDrawer';
import { useBackLayer } from '../lib/backLayer';
import { useIsPhone } from '../hooks/useIsPhone';

type CloseGuard = {
  dirty: boolean;
  flush: () => void;
};

export function TaskDrawer() {
  const { taskKey, closeTask, openTask } = useTaskParam();
  const projectKey = taskKey?.split('-')[0] ?? '';
  const task = useTask(taskKey);
  const detail = useProject(projectKey);
  const guard = useRef<CloseGuard>({ dirty: false, flush: () => {} });
  const [discardOpen, setDiscardOpen] = useState(false);
  const isPhone = useIsPhone();

  const back = useBackLayer(!!taskKey, () => {
    guard.current.flush();
    if (guard.current.dirty) {
      setDiscardOpen(true);
      return true;
    }
    closeTask();
  });

  function requestClose() {
    guard.current.flush();
    if (guard.current.dirty) {
      setDiscardOpen(true);
      return;
    }
    back.dismiss(() => closeTask());
  }

  function discardAndClose() {
    setDiscardOpen(false);
    back.dismiss(() => closeTask());
  }

  return (
    <>
      <Drawer
        open={!!taskKey}
        onClose={requestClose}
        maskClosable={!isPhone}
        width={isPhone ? '100%' : 600}
        closable={false}
        destroyOnHidden
        styles={{
          wrapper: isPhone
            ? { top: 0, bottom: 0, height: '100%', maxHeight: '100dvh' }
            : { top: 16, bottom: 16, height: 'auto', maxHeight: 'calc(100dvh - 32px)' },
          content: { height: '100%', overflow: 'hidden' },
          body: { padding: 0, height: '100%', overflow: 'hidden' },
        }}
      >
        {task.data && detail.data ? (
          <DrawerBody key={task.data.key} task={task.data} detail={detail.data} onClose={requestClose} closeNow={closeTask} openTask={openTask} guard={guard} />
        ) : task.isError ? (
          <div style={{ padding: 32 }}>
            <h2 className="bt-h1" style={{ fontSize: 20 }}>{taskKey} doesn't exist or was deleted</h2>
            <p style={{ color: color.muted }}>Deleted tasks stay in the project's Trash for 30 days.</p>
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

function DrawerBody({ task, detail, onClose, closeNow, openTask, guard }: { task: TaskDetail; detail: ProjectDetail; onClose: () => void; closeNow: () => void; openTask: (key: string) => void; guard: RefObject<CloseGuard> }) {
  const isPhone = useIsPhone();
  const toast = useStatusToast();
  const qc = useQueryClient();
  const me = useMe().data;
  const catalog = useWorkspaceCatalog();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const moveProject = useMoveTaskToProject();
  const restore = useRestoreTask();
  const copyTask = useCopyTask();
  const watch = useSetWatching();
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
  const [confirmMoveProject, setConfirmMoveProject] = useState(false);
  const [confirmWatch, setConfirmWatch] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [preview, setPreview] = useState<{ item: AttachmentItem; src?: string; revoke?: boolean } | null>(null);
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

  async function addTaskFiles(list: File[] | FileList): Promise<number> {
    const { accepted, reason } = partitionAttachmentFiles(Array.from(list));
    if (reason) toast.show({ kind: 'error', text: reason });
    if (!accepted.length) return 0;
    try {
      const next = [...files];
      for (const file of accepted) {
        next.push(await uploadTaskFile(task.key, file));
      }
      setAttachments(next);
      return accepted.length;
    } catch (err) {
      toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not attach that file.' });
      return 0;
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
  const memberUsers = (() => {
    const seated = detail.users.filter((u) => detail.members.some((m) => m.userId === u.id));
    if (me?.user && !seated.some((u) => u.id === me.user.id)) return [me.user, ...seated];
    return seated;
  })();
  const mentionPeople = detail.users.length ? detail.users : memberUsers;
  const mentionInvite = useMentionInvite(detail.project, mentionPeople);
  const watching = Boolean(me && task.watcherIds?.includes(me.user.id));
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
  const descTooLong = isTaskDescriptionTooLong(description);
  const readOnly = me?.workspaceRole === 'viewer';
  const save = (input: UpdateTaskInput) => {
    if (inTrash || readOnly) return;
    if (input.description !== undefined && isTaskDescriptionTooLong(input.description)) return;
    update.mutate(
      { key: task.key, input },
      {
        onSuccess: () => {
          if (input.description !== undefined) savedDescription.current = input.description;
        },
        onError: (err) => {
          toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save this task.' });
        },
      },
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (inTrash || readOnly || !me?.user.id) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'i') return;
      event.preventDefault();
      save({ assigneeId: me.user.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inTrash, readOnly, me?.user.id, save]);

  guard.current = {
    dirty: !isEmptyDescription(commentDraft) || subtaskDraft.trim() !== '',
    flush: () => {
      const next = title.trim();
      if (next && next !== task.title) save({ title: next });
    },
  };

  function persistDesc(next: string) {
    const html = persistDescription(next);
    setDescription(html);
    if (html === savedDescription.current) return;
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

  const passFail = quick.slice(0, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {flow.modal}
      <div style={{ flex: 'none', background: color.surface, borderBottom: `1px solid ${color.divider}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isPhone ? 6 : 8, padding: isPhone ? '12px 8px 8px' : '12px 20px', fontSize: 12.5, color: color.muted }}>
        {isPhone && (
          <button type="button" aria-label="Back" onClick={onClose} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: color.ink3, cursor: 'pointer', font: 'inherit' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 220px' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{detail.project.name}</span>
          {isPhone ? <span aria-hidden="true">·</span> : (
            <>
              <span aria-hidden="true">/</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{section?.name}</span>
              <span aria-hidden="true">/</span>
            </>
          )}
          <strong style={{ color: color.ink, whiteSpace: 'nowrap' }}>{task.key}</strong>
          <span role="status" style={{ whiteSpace: 'nowrap', fontSize: isPhone ? 12 : undefined, color: saving ? color.muted : descTooLong || update.isError ? color.danger : color.brandStrong }}>{saving ? 'Saving…' : descTooLong || update.isError ? 'Not saved' : isPhone ? 'Saved' : '✓ Saved'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 2, flex: 'none', marginLeft: 'auto' }}>
        <Button type="text" size="small" aria-pressed={watching} onClick={() => setConfirmWatch(true)} style={{ whiteSpace: 'nowrap' }}>
          {watching ? 'Watching' : 'Watch'}
        </Button>
        <Button
          type="text"
          size="small"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => {
            const href = window.location.href;
            const done = () => {
              setLinkCopied(true);
              window.setTimeout(() => setLinkCopied(false), 2000);
              toast.show('Link copied.');
            };
            if (!navigator.clipboard?.writeText) {
              toast.show({ text: 'Could not copy the link.', kind: 'error' });
              return;
            }
            void navigator.clipboard.writeText(href).then(done).catch(() => {
              toast.show({ text: 'Could not copy the link.', kind: 'error' });
            });
          }}
        >
          {linkCopied ? 'Copied' : 'Copy link'}
        </Button>
        {!isPhone && (
        <Button
          type="text"
          size="small"
          style={{ whiteSpace: 'nowrap' }}
          loading={copyTask.isPending}
          onClick={() => {
            copyTask.mutate(task.key, {
              onSuccess: (created) => {
                toast.show(`Created ${created.key}.`);
                openTask(created.key);
              },
              onError: (err) => toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not copy this task.' }),
            });
          }}
        >
          Copy
        </Button>
        )}
        {!isPhone && (
        <button type="button" aria-label="Close" onClick={onClose} style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', border: 0, borderRadius: radius.md, background: 'transparent', color: color.ink3, cursor: 'pointer', font: 'inherit', fontSize: 18, flex: 'none' }}>×</button>
        )}
        </div>
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

      <div style={{ padding: isPhone ? '8px 16px 12px' : '8px 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Input.TextArea
          className="bt-task-title"
          variant="borderless"
          value={title}
          aria-label="Task title"
          maxLength={200}
          autoSize={{ minRows: 1, maxRows: 6 }}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          style={{ fontFamily: font.display, fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', background: color.subtle, borderRadius: radius.md, padding: '6px 8px', lineHeight: 1.25 }}
        />

        {!inTrash && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 32 }}>
            <StatusMenu
              name={status?.name ?? task.statusId}
              dot={null}
              bare
              trigger={<StatusPill status={status} />}
              options={options}
              onMove={(statusId) => flow.requestMove(task, statusId)}
            />
            <TypePicker allowed={allowedTypeSlugs(detail, catalog.types.length ? catalog.types.map((item) => item.slug) : ['idea', 'bug', 'improvement', 'feature'])} value={task.type} bare trigger={<TypeTag type={task.type} />} onChange={(type) => save({ type })} />
          </div>
        )}

        {inTrash && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 32 }}>
            <StatusPill status={status} />
            <TypeTag type={task.type} />
          </div>
        )}
      </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowX: 'hidden', overflowY: 'auto' }}>
      <div style={{ padding: isPhone ? '12px 16px' : '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {task.statusId === 'idea' && !inTrash && (
          canDecide ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 10, background: color.mergedTint, border: `1px solid ${color.mergedTint}` }}>
              <span style={{ fontSize: 13.5, color: color.merged }}><strong>Idea</strong> raised by {detail.users.find((u) => u.id === task.reporterId)?.name}. You can decide.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="primary" onClick={() => flow.requestMove(task, 'approved')}>Approve</Button>
                <Button onClick={() => flow.requestMove(task, 'rejected')}>Reject…</Button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: color.subtle, border: `1px solid ${color.divider}`, fontSize: 13.5, color: color.ink3 }}>
              Waiting for approval from <strong>{businessNames || 'Business'}</strong>. Work can start once it's approved.
            </div>
          )
        )}

        {!inTrash && !isPhone && task.statusId !== 'idea' && quick.length > 0 && (
          <div
            role="group"
            aria-labelledby="bt-task-next-step"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 14,
              borderRadius: 10,
              background: color.subtle,
              border: `1px solid ${color.divider}`,
            }}
          >
            <span id="bt-task-next-step" style={{ fontSize: 13.5, fontWeight: 600, color: color.ink2 }}>
              Choose one next step
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {quick.map((o, i) => (
                <Button
                  key={o.status.id}
                  type={i === 0 && !o.status.side ? 'primary' : 'default'}
                  onClick={() => flow.requestMove(task, o.status.id)}
                >
                  {o.check.kind === 'allowed' && o.check.transition.label && !o.status.side ? `${o.check.transition.label} · ${o.status.name}` : o.status.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className={isPhone ? 'bt-task-fields bt-task-fields-phone' : 'bt-task-fields'}>
          <FieldLabel>Assignee</FieldLabel>
          <AssigneePicker value={task.assigneeId} users={memberUsers} detail={detail} meId={me?.user.id} onChange={(assigneeId) => save({ assigneeId })} />
          <FieldLabel>Due</FieldLabel>
          <DuePicker value={task.dueDate} onChange={(dueDate) => save({ dueDate })} />
          <FieldLabel>Priority</FieldLabel>
          <PriorityPicker value={task.priority} onChange={(priority) => save({ priority })} />
          <FieldLabel>Section</FieldLabel>
          <Select value={task.sectionId} onChange={(sectionId: string) => save({ sectionId })} options={detail.sections.map((s) => ({ value: s.id, label: s.name }))} />
          <FieldLabel>Labels</FieldLabel>
          <div className={isPhone ? undefined : 'bt-field-wide'}>
            <LabelPicker value={task.labels} suggestions={labelSuggestions} onChange={(labels) => save({ labels })} />
          </div>
          <FieldLabel>Reporter</FieldLabel>
          <span className={isPhone ? undefined : 'bt-field-wide'} style={{ color: color.ink3, lineHeight: '32px' }}>{detail.users.find((u) => u.id === task.reporterId)?.name ?? 'Unknown'} · {dayjs(task.createdAt).format('D MMM')}</span>
        </div>

        <Section title="Description">
          <DescriptionEditor
            key={editorKey}
            value={description}
            people={mentionPeople}
            invitePeople={mentionInvite.invitePeople}
            canInvite={mentionInvite.canInvite}
            onInvite={mentionInvite.onInvite}
            minHeight={88}
            onChange={(next) => {
              setDescription(next);
              persistDesc(next);
            }}
            onFocusChange={setDescFocused}
            onBlur={(next) => persistDesc(next)}
            onPasteFiles={(files) => { void addTaskFiles(files).then((added) => { if (added) toast.show(added === 1 ? 'Screenshot attached.' : `${added} files attached.`); }); }}
          />
          {descTooLong && (
            <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: color.danger }}>
              {TASK_DESCRIPTION_TOO_LONG}
            </p>
          )}
        </Section>

        <Section title="Attachments">
          <div
            onPaste={(e) => {
              const pasted = filesFromClipboard(e.clipboardData);
              if (pasted.length) {
                e.preventDefault();
                void addTaskFiles(pasted).then((added) => { if (added) toast.show(added === 1 ? 'Screenshot attached.' : `${added} files attached.`); });
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addTaskFiles(Array.from(e.dataTransfer.files)).then((added) => { if (added) toast.show(added === 1 ? 'Screenshot attached.' : `${added} files attached.`); });
            }}
          >
            <AttachmentTiles
              items={files}
              onAdd={(added) => void addTaskFiles(added)}
              onRejected={(reason) => toast.show({ kind: 'error', text: reason })}
              onOpen={(item) => {
                void (async () => {
                  if (!canPreviewAttachment(item.mime)) {
                    await downloadTaskFile(task.key, item.id, item.name);
                    return;
                  }
                  if (item.previewUrl?.startsWith('blob:')) {
                    setPreview({ item, src: item.previewUrl });
                    return;
                  }
                  try {
                    const { url } = await blobUrlForTaskFile(task.key, item.id);
                    setPreview({ item, src: url, revoke: true });
                  } catch {
                    toast.show({ kind: 'error', text: 'Could not open that file.' });
                  }
                })();
              }}
              onRemove={(id) => {
                void deleteTaskFile(task.key, id)
                  .then(() => setAttachments(files.filter((x) => x.id !== id)))
                  .catch(() => toast.show({ kind: 'error', text: 'Could not remove that file.' }));
              }}
            />
          </div>
        </Section>

        <Subtasks task={task} onDraftChange={setSubtaskDraft} />
        <Comments task={task} detail={detail} people={mentionPeople} mentionInvite={mentionInvite} onDraftChange={setCommentDraft} onPasteFiles={(files) => { void addTaskFiles(files).then((added) => { if (added) toast.show(added === 1 ? 'Screenshot attached.' : `${added} files attached.`); }); }} hideComposer={isPhone || readOnly} />
        <DevelopmentSection task={task} />

        <AttachmentPreview
          item={preview?.item ?? null}
          src={preview?.src}
          onClose={() => {
            if (preview?.revoke && preview.src) URL.revokeObjectURL(preview.src);
            setPreview(null);
          }}
          onDownload={() => {
            void downloadTaskFile(task.key, preview!.item.id, preview!.item.name);
          }}
        />
        {!inTrash && !readOnly && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="text" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmMoveProject(true)} loading={moveProject.isPending}>
              Move to another project
            </Button>
            <Button danger type="text" style={{ alignSelf: 'flex-start' }} onClick={remove} loading={del.isPending}>Delete task</Button>
          </div>
        )}
        <MoveToProjectDialog
          open={confirmMoveProject}
          sourceProjectKey={task.projectKey}
          count={1}
          busy={moveProject.isPending}
          onCancel={() => setConfirmMoveProject(false)}
          onConfirm={({ projectKey, sectionId }) => {
            moveProject.mutate(
              { key: task.key, input: { projectKey, sectionId } },
              {
                onSuccess: (moved) => {
                  setConfirmMoveProject(false);
                  openTask(moved.key);
                  toast.show({ text: <><strong>{task.key}</strong> is now <strong>{moved.key}</strong> in {projectKey}.</> });
                },
                onError: () => toast.show({ kind: 'error', text: 'Could not move this task to that project.' }),
              },
            );
          }}
        />
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
        <ConfirmDialog
          open={confirmWatch}
          title={watching ? 'Stop watching this task?' : 'Watch this task?'}
          confirmLabel={watching ? 'Stop watching' : 'Watch'}
          tone={watching ? 'danger' : 'primary'}
          busy={watch.isPending}
          onCancel={() => setConfirmWatch(false)}
          onConfirm={() => {
            watch.mutate(
              { key: task.key, watch: !watching },
              {
                onSuccess: () => {
                  setConfirmWatch(false);
                  toast.show(watching ? 'You stopped watching this task.' : "You're watching this task.");
                },
                onError: (err) => {
                  setConfirmWatch(false);
                  toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update watching.' });
                },
              },
            );
          }}
        >
          {watching
            ? 'You will stop getting updates when someone comments or the stage changes.'
            : 'You will get updates when someone comments or the stage changes.'}
        </ConfirmDialog>
      </div>
      </div>
      {isPhone && !inTrash && (
        <PhoneMoveBar
          task={task}
          people={mentionPeople}
          mentionInvite={mentionInvite}
          options={passFail}
          onMove={(statusId) => flow.requestMove(task, statusId)}
          onDraftChange={setCommentDraft}
          onPasteFiles={(files) => { void addTaskFiles(files).then((added) => { if (added) toast.show(added === 1 ? 'Screenshot attached.' : `${added} files attached.`); }); }}
        />
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="bt-field-label">{children}</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
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
          <span style={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? color.muted : color.ink }}>{s.title}</span>
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

function Comments({ task, detail, people, mentionInvite, onDraftChange, onPasteFiles, hideComposer = false }: { task: TaskDetail; detail: ProjectDetail; people: ProjectDetail['users']; mentionInvite: ReturnType<typeof useMentionInvite>; onDraftChange: (value: string) => void; onPasteFiles?: (files: File[]) => void; hideComposer?: boolean }) {
  const me = useMe().data;
  const { commentId } = useTaskParam();
  const add = useAddComment();
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const write = (value: string) => {
    setDraft(value);
    onDraftChange(value);
  };
  const sending = useRef(false);
  const send = (parentId?: string, value?: string, after?: () => void) => {
    if (sending.current || add.isPending) return;
    const body = persistDescription(value ?? draft);
    if (isEmptyDescription(body)) return;
    sending.current = true;
    add.mutate({ key: task.key, body, parentId }, {
      onSuccess: () => {
        if (!parentId) write('');
        after?.();
      },
      onSettled: () => { sending.current = false; },
    });
  };
  const liveIds = new Set(task.comments.map((comment) => comment.id));
  const roots = task.comments.filter((comment) => !comment.parentId || !liveIds.has(comment.parentId));
  const repliesOf = (id: string) => task.comments.filter((comment) => comment.parentId === id);
  const userOf = (id: string) => detail.users.find((u) => u.id === id);
  useEffect(() => {
    if (!commentId) return;
    setTab('comments');
    const el = document.getElementById(`comment-${commentId}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [commentId, task.comments.length]);
  const activity = task.activity
    .map((a) => ({ id: a.id, at: a.at, who: userOf(a.actorId), text: a.text, via: a.via }))
    .sort((a, b) => a.at.localeCompare(b.at));

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
      {tab === 'comments'
        ? roots.map((comment) => (
            <div key={comment.id}>
              <CommentRow taskKey={task.key} projectKey={task.projectKey} comment={comment} who={userOf(comment.authorId)} people={people} mentionInvite={mentionInvite} meId={me?.user.id} workspaceRole={me?.workspaceRole} highlighted={comment.id === commentId} onPasteFiles={onPasteFiles} onReply={(body, done) => send(comment.id, body, done)} />
              {repliesOf(comment.id).map((reply) => (
                <div key={reply.id} style={{ marginLeft: 36, marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${color.divider}` }}>
                  <CommentRow taskKey={task.key} projectKey={task.projectKey} comment={reply} who={userOf(reply.authorId)} people={people} mentionInvite={mentionInvite} meId={me?.user.id} workspaceRole={me?.workspaceRole} highlighted={reply.id === commentId} onPasteFiles={onPasteFiles} />
                </div>
              ))}
            </div>
          ))
        : activity.map((item) => (
            <div key={item.id} style={{ fontSize: 12.5, color: color.muted, paddingLeft: 38 }}>
              {item.who?.name} {item.text}{item.via !== 'app' ? ` · via ${viaLabel(item.via)}` : ''} · {dayjs(item.at).format('D MMM HH:mm')}
            </div>
          ))}
      {tab === 'comments' && !hideComposer && (
        <>
          <DescriptionEditor
            value={draft}
            people={people}
            invitePeople={mentionInvite.invitePeople}
            canInvite={mentionInvite.canInvite}
            onInvite={mentionInvite.onInvite}
            compact
            showPasteHint={false}
            minHeight={64}
            placeholder="Write a comment. Type @ to mention someone. Paste a screenshot to attach it."
            ariaLabel="Comment"
            onChange={write}
            onPasteFiles={onPasteFiles}
            onEditorKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (e.shiftKey) return;
              e.preventDefault();
              send();
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: color.muted, lineHeight: 1.45 }}>
              <kbd className="bt-kbd">Enter</kbd> to send, <kbd className="bt-kbd">Shift</kbd> + <kbd className="bt-kbd">Enter</kbd> for a new line
            </span>
            <Button type="primary" style={{ flexShrink: 0 }} onClick={() => send()} loading={add.isPending} disabled={isEmptyDescription(draft)}>Comment</Button>
          </div>
        </>
      )}
    </section>
  );
}

function CommentRow({
  taskKey,
  projectKey,
  comment,
  who,
  people,
  mentionInvite,
  meId,
  workspaceRole,
  highlighted,
  onPasteFiles,
  onReply,
}: {
  taskKey: string;
  projectKey: string;
  comment: Comment;
  who: ProjectDetail['users'][number] | undefined;
  people: ProjectDetail['users'];
  mentionInvite: ReturnType<typeof useMentionInvite>;
  meId: string | undefined;
  workspaceRole: WorkspaceRole | undefined;
  highlighted: boolean;
  onPasteFiles?: (files: File[]) => void;
  onReply?: (body: string, done: () => void) => void;
}) {
  const toast = useStatusToast();
  const update = useUpdateComment();
  const remove = useDeleteComment();
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const canEdit = meId === comment.authorId;
  const canDelete = canEdit || workspaceRole === 'owner' || workspaceRole === 'admin';

  function copyLink() {
    const url = `${window.location.origin}/p/${encodeURIComponent(projectKey)}/list?task=${encodeURIComponent(taskKey)}&comment=${encodeURIComponent(comment.id)}`;
    const done = () => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
      toast.show('Comment link copied.');
    };
    if (!navigator.clipboard?.writeText) {
      toast.show({ text: 'Could not copy the link.', kind: 'error' });
      return;
    }
    void navigator.clipboard.writeText(url).then(done).catch(() => {
      toast.show({ text: 'Could not copy the link.', kind: 'error' });
    });
  }

  const save = () => {
    const body = persistDescription(editDraft);
    if (isEmptyDescription(body) || body === persistDescription(comment.body)) {
      setEditing(false);
      setEditDraft(comment.body);
      return;
    }
    update.mutate(
      { key: taskKey, commentId: comment.id, body },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <div id={`comment-${comment.id}`} className={highlighted ? 'bt-comment-target' : undefined} style={{ display: 'flex', gap: 10 }}>
      <Avatar user={who} size={28} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5 }}>
        <strong>{who?.name}</strong> <span style={{ color: color.muted, fontSize: 12.5 }}>{dayjs(comment.createdAt).format('D MMM HH:mm')}</span>
        {editing ? (
          <>
            <div style={{ marginTop: 6 }}>
              <DescriptionEditor
                value={editDraft}
                people={people}
                invitePeople={mentionInvite.invitePeople}
                canInvite={mentionInvite.canInvite}
                onInvite={mentionInvite.onInvite}
                compact
                showPasteHint={false}
                minHeight={64}
                placeholder="Edit comment. Type @ to mention someone."
                ariaLabel="Edit comment"
                onChange={setEditDraft}
                onPasteFiles={onPasteFiles}
                onEditorKeyDown={(e) => {
                  if (e.key === 'Escape') { setEditing(false); setEditDraft(comment.body); return; }
                  if (e.key !== 'Enter' || e.shiftKey) return;
                  e.preventDefault();
                  save();
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button onClick={() => { setEditing(false); setEditDraft(comment.body); }}>Cancel</Button>
              <Button type="primary" onClick={save} loading={update.isPending} disabled={isEmptyDescription(editDraft)}>Save</Button>
            </div>
          </>
        ) : (
          <>
            <div className="bt-comment-body" dangerouslySetInnerHTML={{ __html: readableDescriptionHtml(comment.body, people) }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              {onReply && (
                <button type="button" onClick={() => setReplying((open) => !open)} style={commentAction}>
                  Reply
                </button>
              )}
              <button type="button" onClick={copyLink} style={commentAction}>
                {linkCopied ? 'Copied' : 'Copy link'}
              </button>
              {canEdit && (
                <button type="button" onClick={() => { setEditDraft(comment.body); setEditing(true); }} style={commentAction}>
                  Edit
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => setConfirmDelete(true)} style={commentAction}>
                  Delete
                </button>
              )}
            </div>
            {replying && onReply && (
              <div style={{ marginTop: 8 }}>
                <DescriptionEditor
                  value={replyDraft}
                  people={people}
                  invitePeople={mentionInvite.invitePeople}
                  canInvite={mentionInvite.canInvite}
                  onInvite={mentionInvite.onInvite}
                  compact
                  showPasteHint={false}
                  minHeight={56}
                  placeholder="Write a reply. Type @ to mention someone."
                  ariaLabel="Reply"
                  onChange={setReplyDraft}
                  onPasteFiles={onPasteFiles}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Button onClick={() => { setReplying(false); setReplyDraft(''); }}>Cancel</Button>
                  <Button type="primary" disabled={isEmptyDescription(replyDraft)} onClick={() => onReply(replyDraft, () => { setReplying(false); setReplyDraft(''); })}>Reply</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this comment?"
        confirmLabel="Delete comment"
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate({ key: taskKey, commentId: comment.id }, { onSuccess: () => setConfirmDelete(false) })}
      >
        This removes the comment from the task. You cannot undo this.
      </ConfirmDialog>
    </div>
  );
}

const commentAction = {
  height: 24,
  padding: 0,
  border: 0,
  background: 'transparent',
  font: 'inherit',
  fontSize: 12.5,
  color: color.muted,
  cursor: 'pointer',
} as const;

function PhoneMoveBar({
  task,
  people,
  mentionInvite,
  options,
  onMove,
  onDraftChange,
  onPasteFiles,
}: {
  task: TaskDetail;
  people: ProjectDetail['users'];
  mentionInvite: ReturnType<typeof useMentionInvite>;
  options: ReturnType<typeof moveOptions>;
  onMove: (statusId: string) => void;
  onDraftChange: (value: string) => void;
  onPasteFiles?: (files: File[]) => void;
}) {
  const add = useAddComment();
  const [draft, setDraft] = useState('');
  const write = (value: string) => {
    setDraft(value);
    onDraftChange(value);
  };
  const send = () => {
    const body = persistDescription(draft);
    if (isEmptyDescription(body) || add.isPending) return;
    add.mutate({ key: task.key, body }, { onSuccess: () => write('') });
  };
  const allowed = options.filter((item) => item.check.kind === 'allowed');

  return (
    <div className="bt-phone-move-bar" style={{ flex: 'none', padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${color.border}`, display: 'flex', flexDirection: 'column', gap: 10, background: color.surface }}>
      {allowed.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {allowed.slice(0, 2).map((item) => {
            const label = item.check.kind === 'allowed' && item.check.transition.label && !item.status.side
              ? `${item.check.transition.label} · ${item.status.name}`
              : item.status.name;
            return (
              <Button
                key={item.status.id}
                size="small"
                onClick={() => onMove(item.status.id)}
                style={{ height: 32, borderRadius: 8, fontSize: 13 }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}
      <DescriptionEditor
        value={draft}
        people={people}
        invitePeople={mentionInvite.invitePeople}
        canInvite={mentionInvite.canInvite}
        onInvite={mentionInvite.onInvite}
        compact
        showPasteHint={false}
        minHeight={56}
        placeholder="Comment. Type @ to mention someone."
        ariaLabel="Comment"
        onChange={write}
        onPasteFiles={onPasteFiles}
        onEditorKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey) return;
          e.preventDefault();
          send();
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={send} loading={add.isPending} disabled={isEmptyDescription(draft)}>Comment</Button>
      </div>
    </div>
  );
}

function viaLabel(via: ActorVia) {
  if (via === 'mcp') return 'Claude';
  if (via === 'github') return 'GitHub';
  if (via === 'automation') return 'automation';
  return 'import';
}
