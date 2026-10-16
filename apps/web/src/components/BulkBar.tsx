// Dark bar shown when list rows are selected. Moves still go through moveTask.
import { DatePicker, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useDeleteTask, useMe, useMoveTask, useRestoreTask, useUpdateTask } from '../api/queries';
import type { ProjectDetail, ProjectRole, Task } from '../api/types';
import { moveOptions } from '../lib/workflow';
import { color, radius } from '../theme/tokens';
import { trashToldCopy } from '../lib/toldPeople';
import { ConfirmDialog } from './ConfirmDialog';
import { useStatusToast } from './StatusToast';

export function BulkBar({
  tasks,
  detail,
  roles,
  onClear,
}: {
  tasks: Task[];
  detail: ProjectDetail;
  roles: ProjectRole[];
  onClear: () => void;
}) {
  const toast = useStatusToast();
  const me = useMe().data;
  const move = useMoveTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const restore = useRestoreTask();
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClear]);

  const allowed = detail.workflow.statuses.filter((status) =>
    tasks.every((task) => moveOptions(detail.workflow, task, roles).some((option) => option.status.id === status.id && option.check.kind === 'allowed')),
  );

  const members = detail.members
    .map((member) => detail.users.find((user) => user.id === member.userId))
    .filter((user) => !!user);

  async function moveAll(statusId: string, extra?: { comment?: string }) {
    const needsComment = tasks.some((task) => {
      const option = moveOptions(detail.workflow, task, roles).find((row) => row.status.id === statusId);
      return option?.check.kind === 'allowed' && option.check.transition.requireComment;
    });
    if (needsComment && !extra?.comment) {
      setComment('');
      setCommentFor(statusId);
      return;
    }
    for (const task of tasks) {
      await move.mutateAsync({ key: task.key, input: { toStatusId: statusId, comment: extra?.comment } });
    }
    setCommentFor(null);
    onClear();
  }

  async function patchAll(input: Parameters<typeof update.mutateAsync>[0]['input']) {
    for (const task of tasks) {
      await update.mutateAsync({ key: task.key, input });
    }
    onClear();
  }

  function bulkToldNames() {
    const ids = tasks.flatMap((task) => [task.assigneeId, task.reporterId]).filter(
      (id): id is string => Boolean(id) && id !== me?.user.id,
    );
    return [...new Set(ids)].map((id) => detail.users.find((user) => user.id === id)?.name).filter((name): name is string => Boolean(name));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 12px', background: color.ink, color: color.surface, borderRadius: radius.lg }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px', fontSize: 13.5, fontWeight: 600 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: color.brand, display: 'grid', placeItems: 'center' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color.surface} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </span>
        {tasks.length} selected
      </span>
      <span style={{ width: 1, height: 22, background: color.ink3 }} />
      <Select
        aria-label="Move to"
        placeholder="Move to"
        value={undefined}
        popupMatchSelectWidth={false}
        options={allowed.map((status) => ({ value: status.id, label: status.name }))}
        onChange={(statusId: string) => void moveAll(statusId)}
        style={{ minWidth: 120 }}
        disabled={allowed.length === 0}
      />
      <Select
        aria-label="Assign"
        placeholder="Assign"
        value={undefined}
        popupMatchSelectWidth={false}
        options={[{ value: '__none', label: 'Unassigned' }, ...members.map((user) => ({ value: user.id, label: user.name }))]}
        onChange={(value: string) => void patchAll({ assigneeId: value === '__none' ? null : value })}
        style={{ minWidth: 120 }}
      />
      <DatePicker
        aria-label="Due date"
        placeholder="Due date"
        onChange={(value) => void patchAll({ dueDate: value ? value.format('YYYY-MM-DD') : null })}
      />
      <Select
        aria-label="Section"
        placeholder="Section"
        value={undefined}
        popupMatchSelectWidth={false}
        options={detail.sections.map((section) => ({ value: section.id, label: section.name }))}
        onChange={(sectionId: string) => void patchAll({ sectionId })}
        style={{ minWidth: 120 }}
      />
      <Select
        aria-label="Labels"
        mode="tags"
        placeholder="Labels"
        value={labels}
        onChange={setLabels}
        onOpenChange={(open) => {
          if (open || labels.length === 0) return;
          void (async () => {
            for (const task of tasks) {
              await update.mutateAsync({ key: task.key, input: { labels: [...new Set([...task.labels, ...labels])] } });
            }
            setLabels([]);
            onClear();
          })();
        }}
        style={{ minWidth: 140 }}
      />
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        style={{ height: 34, padding: '0 12px', border: 0, borderRadius: radius.md, background: 'transparent', color: color.danger, font: 'inherit', fontSize: 13, cursor: 'pointer' }}
      >
        Delete
      </button>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: color.faint }}>Move to only offers stages allowed for every selected task</span>
      <button type="button" onClick={onClear} aria-label="Clear selection" style={{ height: 28, padding: '0 8px', border: `1px solid ${color.ink3}`, borderRadius: 5, background: 'transparent', color: color.faint, font: 'inherit', fontSize: 12, cursor: 'pointer' }}>Esc</button>
      {commentFor && (
        <div style={{ flexBasis: '100%', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            aria-label="Comment for this move"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="This move needs a comment"
            style={{ flex: 1, height: 34, padding: '0 10px', border: 0, borderRadius: radius.md, font: 'inherit' }}
          />
          <button type="button" disabled={!comment.trim()} onClick={() => void moveAll(commentFor, { comment: comment.trim() })} style={{ height: 34, padding: '0 12px', border: 0, borderRadius: radius.md, background: color.surface, color: color.ink, font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
            Move
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}?`}
        confirmLabel={tasks.length === 1 ? 'Move 1 to Trash' : `Move ${tasks.length} to Trash`}
        busy={del.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const keys = tasks.map((task) => task.key);
          for (const key of keys) await del.mutateAsync(key);
          setConfirmDelete(false);
          if (keys.length === 1 && keys[0]) {
            const key = keys[0];
            toast.show({
              text: <><strong>{key}</strong> moved to Trash</>,
              onUndo: () => restore.mutate(key),
              showShortcut: true,
              durationMs: 10000,
            });
          } else {
            toast.show(`${keys.length} moved to Trash. They stay there for 30 days.`);
          }
          onClear();
        }}
      >
        {trashToldCopy(bulkToldNames())}
      </ConfirmDialog>
    </div>
  );
}
