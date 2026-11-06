import { Input } from 'antd';
import type { InputRef } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ganttBar } from '@borntask/shared';
import { useCreateTask, useUpdateTask } from '../api/queries';
import type { ProjectDetail, Task } from '../api/types';
import { allowedTypeSlugs } from '../lib/taskFilters';
import { color, radius } from '../theme/tokens';
import { SearchIcon } from './Chips';
import { useStatusToast } from './StatusToast';

export type GanttAddAnchor = {
  ymd: string;
  left: number;
  width: number;
  clientX: number;
  clientY: number;
  rowKey: string;
  sectionId: string;
  planningParentId?: string | null;
};

function taskKeyFromQuery(raw: string): string | null {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/[?&]task=([A-Z][A-Z0-9]*-\d+)/i);
  if (fromUrl?.[1]) return fromUrl[1].toUpperCase();
  const key = trimmed.match(/\b([A-Z][A-Z0-9]*-\d+)\b/i);
  return key?.[1]?.toUpperCase() ?? null;
}

function matchesTask(task: Task, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const key = taskKeyFromQuery(q);
  if (key && task.key.toUpperCase() === key) return true;
  return task.title.toLowerCase().includes(needle) || task.key.toLowerCase().includes(needle);
}

export function scheduleOnDay(task: Task, ymd: string): { startDate: string; dueDate: string } {
  const bar = ganttBar(task.startDate, task.dueDate);
  if (bar.kind === 'range' && bar.start && bar.end) {
    const start = new Date(`${bar.start}T00:00:00Z`);
    const end = new Date(`${bar.end}T00:00:00Z`);
    const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    const due = new Date(`${ymd}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + days);
    return { startDate: ymd, dueDate: due.toISOString().slice(0, 10) };
  }
  return { startDate: ymd, dueDate: ymd };
}

export function GanttAddPopover({
  anchor,
  detail,
  tasks,
  onClose,
}: {
  anchor: GanttAddAnchor;
  detail: ProjectDetail;
  tasks: Task[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'find' | 'create'>('find');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [browse, setBrowse] = useState(false);
  const findRef = useRef<InputRef>(null);
  const createRef = useRef<InputRef>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toast = useStatusToast();
  const create = useCreateTask();
  const update = useUpdateTask();

  useEffect(() => {
    const id = window.setTimeout(() => {
      (tab === 'find' ? findRef : createRef).current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [tab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  const recent = useMemo(() => {
    const unscheduled = tasks.filter((task) => ganttBar(task.startDate, task.dueDate).kind === 'unscheduled');
    const dated = tasks
      .filter((task) => ganttBar(task.startDate, task.dueDate).kind !== 'unscheduled')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return [...unscheduled, ...dated].slice(0, 8);
  }, [tasks]);

  const found = useMemo(() => {
    const source = browse || query.trim() ? tasks : recent;
    return source.filter((task) => matchesTask(task, query)).slice(0, 12);
  }, [browse, query, tasks, recent]);

  const left = Math.min(Math.max(12, anchor.clientX - 24), globalThis.innerWidth - 360);
  const top = Math.min(anchor.clientY + 10, globalThis.innerHeight - 360);

  function placeTask(task: Task) {
    const dates = scheduleOnDay(task, anchor.ymd);
    update.mutate(
      { key: task.key, input: dates },
      {
        onSuccess: () => onClose(),
        onError: (err) => toast.show({ kind: 'error', text: err instanceof Error && err.message ? err.message : 'Could not place this task.' }),
      },
    );
  }

  function createTask() {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const types = allowedTypeSlugs(detail, ['idea', 'bug', 'improvement', 'feature', 'story', 'epic']);
    const type = types[0] ?? 'idea';
    create.mutate(
      {
        projectKey: detail.project.key,
        sectionId: anchor.sectionId,
        type,
        title: nextTitle,
        description: '',
        assigneeId: null,
        priority: 'none',
        dueDate: anchor.ymd,
        startDate: anchor.ymd,
        labels: [],
        attachmentIds: [],
        planningParentId: anchor.planningParentId ?? null,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => toast.show({ kind: 'error', text: err instanceof Error && err.message ? err.message : 'Could not create this task.' }),
      },
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add task to timeline"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 60,
        width: 340,
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        boxShadow: color.shadow,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', borderBottom: `1px solid ${color.divider}`, padding: '0 12px' }}>
        {([
          { id: 'find', label: 'Find task' },
          { id: 'create', label: 'Create task' },
        ] as const).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            style={{
              height: 40,
              padding: '0 10px',
              border: 0,
              borderBottom: tab === item.id ? `2px solid ${color.ink}` : '2px solid transparent',
              background: 'transparent',
              color: tab === item.id ? color.ink : color.muted,
              font: 'inherit',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'find' ? (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: color.muted }}>
            <SearchIcon size={16} />
            <Input
              ref={findRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for task name, ID or URL"
              variant="borderless"
              style={{ padding: 0, fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ color: color.muted, fontWeight: 600 }}>{query.trim() || browse ? 'Tasks' : 'Recent'}</span>
            <button
              type="button"
              onClick={() => setBrowse((on) => !on)}
              style={{ border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              {browse ? 'Show recent' : 'Browse tasks'}
            </button>
          </div>
          <div style={{ maxHeight: 240, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {found.length === 0 ? (
              <span style={{ fontSize: 13, color: color.muted, padding: '8px 0' }}>No matching tasks</span>
            ) : found.map((task) => (
              <button
                key={task.key}
                type="button"
                onClick={() => placeTask(task)}
                disabled={update.isPending}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  minWidth: 0,
                  padding: '8px 4px',
                  border: 0,
                  background: 'transparent',
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span className="bt-key">{task.key}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{task.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
          onSubmit={(event) => {
            event.preventDefault();
            createTask();
          }}
        >
          <Input
            ref={createRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task name"
            maxLength={200}
          />
          <button
            type="submit"
            disabled={!title.trim() || create.isPending}
            style={{
              height: 34,
              border: 0,
              borderRadius: radius.md,
              background: color.brandFill,
              color: color.brandOn,
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              cursor: title.trim() ? 'pointer' : 'default',
              opacity: title.trim() ? 1 : 0.55,
            }}
          >
            Create
          </button>
        </form>
      )}
    </div>
  );
}
