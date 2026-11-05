import { Button, Input, Select } from 'antd';
import { useMemo, useState } from 'react';
import { TASK_LINK_LABELS, TASK_LINK_RELATIONS, type TaskLinkRelation } from '@borntask/shared';
import { useAddTaskLink, useRemoveTaskLink, useSearch } from '../api/queries';
import type { TaskDetail, TaskLink } from '../api/types';
import { color } from '../theme/tokens';
import { useStatusToast } from './StatusToast';
import { useTaskParam } from './useTaskParam';

const ADD_TYPES: { value: TaskLinkRelation; label: string }[] = TASK_LINK_RELATIONS.map((value) => ({
  value,
  label: TASK_LINK_LABELS[value === 'relates' ? 'relates' : value],
}));

export function TaskLinks({ task, readOnly }: { task: TaskDetail; readOnly: boolean }) {
  const add = useAddTaskLink();
  const remove = useRemoveTaskLink();
  const toast = useStatusToast();
  const { openTask } = useTaskParam();
  const [kind, setKind] = useState<TaskLinkRelation>('relates');
  const [query, setQuery] = useState('');
  const search = useSearch(query.trim());
  const links = task.links ?? [];
  const groups = useMemo(() => {
    const order = ['blocked_by', 'blocks', 'relates', 'duplicates', 'duplicated_by'] as const;
    return order
      .map((type) => ({ type, rows: links.filter((link) => link.type === type) }))
      .filter((group) => group.rows.length > 0);
  }, [links]);

  const hits = (search.data?.hits ?? []).filter((hit) => hit.key !== task.key).slice(0, 8);

  function onAdd(otherKey: string) {
    add.mutate(
      { key: task.key, type: kind, otherKey },
      {
        onSuccess: () => setQuery(''),
        onError: (err) => toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not add that link.' }),
      },
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Links</h3>
      {groups.length === 0 && <span style={{ fontSize: 13, color: color.muted }}>No linked tasks yet.</span>}
      {groups.map((group) => (
        <div key={group.type} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink3 }}>{TASK_LINK_LABELS[group.type]}</span>
          {group.rows.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              readOnly={readOnly}
              onOpen={() => openTask(link.key)}
              onRemove={() => {
                remove.mutate(
                  { key: task.key, id: link.id },
                  { onError: () => toast.show({ kind: 'error', text: 'Could not remove that link.' }) },
                );
              }}
            />
          ))}
        </div>
      ))}
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Select
            value={kind}
            onChange={(value: TaskLinkRelation) => setKind(value)}
            options={ADD_TYPES}
            style={{ width: 140 }}
            aria-label="Link type"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Task key or title"
            aria-label="Find a task to link"
            style={{ flex: '1 1 180px', minWidth: 160 }}
          />
        </div>
      )}
      {!readOnly && query.trim() && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {search.isFetching && <span style={{ fontSize: 13, color: color.muted }}>Searching…</span>}
          {hits.map((hit) => (
            <button
              key={hit.key}
              type="button"
              onClick={() => onAdd(hit.key)}
              disabled={add.isPending}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
                textAlign: 'left',
                border: `1px solid ${color.divider}`,
                background: color.surface,
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <span style={{ fontSize: 12, color: color.muted, flex: 'none' }}>{hit.key}</span>
              <span style={{ fontSize: 13.5, color: color.ink }}>{hit.title}</span>
            </button>
          ))}
          {!search.isFetching && hits.length === 0 && (
            <span style={{ fontSize: 13, color: color.muted }}>No matching tasks.</span>
          )}
        </div>
      )}
    </section>
  );
}

function LinkRow({
  link,
  readOnly,
  onOpen,
  onRemove,
}: {
  link: TaskLink;
  readOnly: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          textAlign: 'left',
          border: 0,
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, color: color.muted, flex: 'none' }}>{link.key}</span>
        <span style={{ fontSize: 13.5, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.title}</span>
      </button>
      {!readOnly && (
        <Button type="link" onClick={onRemove} style={{ height: 28, padding: '0 4px' }}>
          Remove
        </Button>
      )}
    </div>
  );
}
