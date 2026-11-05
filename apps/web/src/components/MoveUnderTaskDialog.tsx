import { Input } from 'antd';
import { useEffect, useState } from 'react';
import { useSearch } from '../api/queries';
import { color } from '../theme/tokens';
import { ConfirmDialog } from './ConfirmDialog';

export function taskNeedsConvertWarn(task: {
  comments: unknown[];
  attachments?: unknown[];
  activity: { text: string }[];
}): boolean {
  return (
    task.comments.length > 0
    || (task.attachments?.length ?? 0) > 0
    || task.activity.some((row) => !/^created this\b/i.test(row.text))
  );
}

export function MoveUnderTaskDialog({
  open,
  sourceKey,
  busy,
  warn,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  sourceKey: string;
  busy: boolean;
  warn: boolean;
  onCancel: () => void;
  onConfirm: (parentKey: string) => void;
}) {
  const [q, setQ] = useState('');
  const [parentKey, setParentKey] = useState('');
  const search = useSearch(q.trim().length >= 1 ? q.trim() : '');
  const hits = (search.data?.hits ?? []).filter((hit) => hit.key !== sourceKey).slice(0, 8);

  useEffect(() => {
    if (!open) {
      setQ('');
      setParentKey('');
    }
  }, [open]);

  return (
    <ConfirmDialog
      open={open}
      title="Move under another task?"
      confirmLabel={warn ? 'Move and copy onto parent' : 'Move under task'}
      tone="primary"
      busy={busy}
      confirmDisabled={!parentKey}
      onCancel={onCancel}
      onConfirm={() => {
        if (parentKey) onConfirm(parentKey);
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0 }}>
          {sourceKey} becomes a checklist item on the task you pick. Search by key or title.
        </p>
        {warn ? (
          <p style={{ margin: 0 }}>
            This task has comments, attachments or history. Those will be copied onto a comment on the parent. The old key will open the parent.
          </p>
        ) : null}
        <Input
          aria-label="Search for a parent task"
          placeholder="Search by key or title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflow: 'auto' }}>
          {hits.map((hit) => (
            <li key={hit.key}>
              <button
                type="button"
                onClick={() => setParentKey(hit.key)}
                aria-pressed={parentKey === hit.key}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: `1px solid ${parentKey === hit.key ? color.ink : color.border}`,
                  borderRadius: 8,
                  background: color.surface,
                  padding: '8px 10px',
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'block', fontSize: 12, color: color.muted }}>{hit.key}</span>
                <span style={{ display: 'block', fontSize: 13 }}>{hit.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ConfirmDialog>
  );
}
