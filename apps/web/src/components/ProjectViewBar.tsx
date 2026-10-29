// Filter builder, saved views, group and sort. Shared by the list and the board.
import { Input, Modal, Select } from 'antd';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { ProjectDetail } from '../api/types';
import {
  activePresetId,
  allowedGroup,
  chipLabel,
  choicesFor,
  decodeFilters,
  defaultFilters,
  encodeFilters,
  fieldLabel,
  FILTER_FIELDS,
  newFilterId,
  opLabel,
  opsFor,
  personChoices,
  encodeHiddenCols,
  LIST_FIELD_LABEL,
  LIST_FIELDS,
  PRESET_VIEWS,
  readColumns,
  readGroup,
  readHiddenCols,
  readLastProjectView,
  readSavedViews,
  readSort,
  writeLastProjectView,
  writeSavedViews,
  type ColumnBy,
  type FilterCondition,
  type FilterField,
  type FilterOp,
  type GroupBy,
  type ListField,
  type PresetView,
  type SavedView,
  type SortBy,
} from '../lib/taskFilters';
import { color, radius } from '../theme/tokens';
import { ConfirmDialog } from './ConfirmDialog';
import { useBackLayer } from '../lib/backLayer';
import { useIsPhone } from '../hooks/useIsPhone';

export type ProjectView = {
  filters: FilterCondition[];
  group: GroupBy;
  sort: SortBy;
  columns: ColumnBy;
  hiddenCols: ListField[];
  viewId: string | null;
};

const KEEP = ['task', 'f', 'group', 'sort', 'columns', 'hide', 'view'] as const;

const URL_VIEW_KEYS = ['f', 'view', 'group', 'sort', 'columns', 'hide'] as const;

export function useProjectView(): ProjectView & { setView: (patch: Partial<ProjectView>) => void } {
  const { projectKey } = useParams();
  const [params, setParams] = useSearchParams();
  const hasUrlView = URL_VIEW_KEYS.some((key) => params.has(key));
  const last = !hasUrlView && projectKey ? readLastProjectView(projectKey) : null;
  const rawFilters = params.get('f');
  const filters = hasUrlView
    ? (rawFilters === null ? defaultFilters() : decodeFilters(rawFilters))
    : (last?.filters ?? defaultFilters());
  const group = hasUrlView ? readGroup(params.get('group')) : (last?.group ?? 'section');
  const sort = hasUrlView ? readSort(params.get('sort')) : (last?.sort ?? 'manual');
  const columns = hasUrlView ? readColumns(params.get('columns')) : (last?.columns ?? 'status');
  const hiddenCols = hasUrlView ? readHiddenCols(params.get('hide')) : (last?.hiddenCols ?? []);
  const viewId = hasUrlView ? params.get('view') : (last?.viewId ?? 'preset-open');

  useEffect(() => {
    if (!projectKey) return;
    writeLastProjectView(projectKey, { filters, group, sort, columns, hiddenCols, viewId });
  }, [projectKey, encodeFilters(filters), group, sort, columns, encodeHiddenCols(hiddenCols), viewId]);

  const setView = (patch: Partial<ProjectView>) => {
    const merged: ProjectView = { filters, group, sort, columns, hiddenCols, viewId, ...patch };
    if (projectKey) writeLastProjectView(projectKey, merged);
    const next = new URLSearchParams(params);
    next.set('f', encodeFilters(merged.filters));
    next.set('group', merged.group);
    next.set('sort', merged.sort);
    next.set('columns', merged.columns);
    const hide = encodeHiddenCols(merged.hiddenCols);
    if (hide) next.set('hide', hide);
    else next.delete('hide');
    if (merged.viewId) next.set('view', merged.viewId);
    else next.delete('view');
    setParams(next, { replace: true });
  };

  return { filters, group, sort, columns, hiddenCols, viewId, setView };
}

export function projectViewSearch(params: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of KEEP) {
    const value = params.get(key);
    if (value !== null) next.set(key, value);
  }
  const q = next.toString();
  return q ? `?${q}` : '';
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16l-6 8v5l-4 2v-7z" />
    </svg>
  );
}

const controlStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  background: color.surface,
  font: 'inherit',
  fontSize: 13,
  color: color.ink,
};

export function ProjectViewBar({
  mode,
  detail,
  workspaceId,
  canShare,
  labels,
  count,
  view,
  onView,
}: {
  mode: 'list' | 'board';
  detail: ProjectDetail;
  workspaceId: string;
  canShare: boolean;
  labels: string[];
  count: number;
  view: ProjectView;
  onView: (patch: Partial<ProjectView>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedView | null>(null);
  const isPhone = useIsPhone();
  useBackLayer(open, () => setOpen(false));
  useBackLayer(saving, () => setSaving(false));
  const [views, setViews] = useState<SavedView[]>(() => readSavedViews(workspaceId, detail.project.key));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViews(readSavedViews(workspaceId, detail.project.key));
  }, [workspaceId, detail.project.key]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.ant-select-dropdown, .ant-modal-root')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const change = (patch: Partial<ProjectView>, keepView = false) => {
    onView(keepView ? patch : { ...patch, viewId: null });
  };

  const applyPreset = (preset: PresetView) => {
    onView({ filters: preset.filters, group: preset.group, sort: preset.sort, viewId: preset.id });
  };

  const applySaved = (saved: SavedView) => {
    onView({ filters: saved.filters, group: saved.group, sort: saved.sort, viewId: saved.id });
  };

  const selectedPreset = activePresetId(view.filters, view.viewId);

  const removeSaved = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    writeSavedViews(workspaceId, detail.project.key, next);
    if (view.viewId === id) onView({ viewId: null });
  };

  const save = (name: string, visibility: 'me' | 'project') => {
    const saved: SavedView = {
      id: newFilterId(),
      name,
      visibility,
      group: view.group,
      sort: view.sort,
      filters: view.filters,
    };
    const next = [...views, saved];
    setViews(next);
    writeSavedViews(workspaceId, detail.project.key, next);
    onView({ viewId: saved.id });
    setSaving(false);
  };

  const viewTabs = (
    <>
      {PRESET_VIEWS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => applyPreset(preset)}
          style={{
            height: 32,
            padding: '0 12px',
            border: 0,
            background: 'transparent',
            font: 'inherit',
            fontSize: 13.5,
            fontWeight: selectedPreset === preset.id ? 600 : 400,
            color: selectedPreset === preset.id ? color.ink : color.muted,
            cursor: 'pointer',
          }}
        >
          {preset.name}
        </button>
      ))}
      {views.map((saved) => (
        <span key={saved.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 4px 0 12px' }}>
          <button
            type="button"
            onClick={() => applySaved(saved)}
            style={{
              height: 32,
              padding: 0,
              border: 0,
              background: 'transparent',
              font: 'inherit',
              fontSize: 13.5,
              fontWeight: view.viewId === saved.id ? 600 : 400,
              color: view.viewId === saved.id ? color.ink : color.muted,
              cursor: 'pointer',
            }}
          >
            {saved.name}
          </button>
          <button type="button" aria-label={`Remove view ${saved.name}`} onClick={() => setPendingDelete(saved)} style={iconBtn}>×</button>
        </span>
      ))}
      {!isPhone && (
      <button type="button" onClick={() => setSaving(true)} style={{ height: 32, padding: '0 10px', border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        + Save view
      </button>
      )}
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 0 }}>{viewTabs}</div>
        <div ref={panelRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: 6, color: color.ink3, cursor: 'pointer' }}>
            <FilterIcon /> Filter
          </button>
          {open && (
            <FilterBuilder
              detail={detail}
              labels={labels}
              filters={view.filters}
              count={count}
              onChange={(filters) => change({ filters })}
            />
          )}
        </div>
        {view.filters.map((condition) => (
          <span key={condition.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 6px 0 10px', borderRadius: radius.md, background: color.brandTint, color: color.brandStrong, fontSize: 13, fontWeight: 500 }}>
            {chipLabel(condition, detail)}
            <button type="button" aria-label={`Remove ${fieldLabel(condition.field)} filter`} onClick={() => change({ filters: view.filters.filter((f) => f.id !== condition.id) })} style={{ ...iconBtn, color: color.brandStrong }}>×</button>
          </span>
        ))}
        {mode === 'list' && !isPhone && (
          <>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: color.muted }}>Group</span>
            <select aria-label="Group" value={allowedGroup(view.group, detail.workBreakdown)} onChange={(e) => change({ group: readGroup(e.target.value) })} style={controlStyle}>
              <option value="section">Section</option>
              <option value="status">Status</option>
              <option value="assignee">Assignee</option>
              <option value="priority">Priority</option>
              {(detail.workBreakdown === 'stories' || detail.workBreakdown === 'epics_stories') && <option value="story">Story</option>}
              {detail.workBreakdown === 'epics_stories' && <option value="epic">Epic</option>}
              <option value="none">None</option>
            </select>
            <span style={{ fontSize: 13, color: color.muted }}>Sort</span>
            <select aria-label="Sort" value={view.sort} onChange={(e) => change({ sort: readSort(e.target.value) })} style={controlStyle}>
              <option value="manual">Manual</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="title">Title</option>
            </select>
            <ColumnPicker hidden={view.hiddenCols} onChange={(hiddenCols) => change({ hiddenCols })} />
          </>
        )}
        {mode === 'board' && !isPhone && (
          <>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: color.muted }}>Columns</span>
            <select aria-label="Columns" value={view.columns} onChange={(e) => onView({ columns: readColumns(e.target.value) })} style={controlStyle}>
              <option value="status">Status</option>
              <option value="section">Section</option>
              <option value="assignee">Assignee</option>
              <option value="priority">Priority</option>
            </select>
          </>
        )}
      </div>
      <SaveViewDialog
        open={saving}
        projectName={detail.project.name}
        canShare={canShare}
        summary={[mode === 'list' ? 'List' : 'Board', `Grouped by ${view.group}`, `${view.filters.length} filter${view.filters.length === 1 ? '' : 's'}`, `Sorted by ${view.sort}`]}
        onCancel={() => setSaving(false)}
        onSave={save}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : 'Delete this view?'}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          removeSaved(pendingDelete.id);
          setPendingDelete(null);
        }}
      >
        This removes the saved view from this browser. You cannot undo it.
      </ConfirmDialog>
    </div>
  );
}

function ColumnPicker({ hidden, onChange }: { hidden: ListField[]; onChange: (hidden: ListField[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={controlStyle}>
        Columns
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 20, width: 200, padding: 8, background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, boxShadow: color.shadow }}>
          {LIST_FIELDS.map((field) => {
            const shown = !hidden.includes(field);
            return (
              <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, padding: '0 6px', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={() => {
                    onChange(shown ? [...hidden, field] : hidden.filter((item) => item !== field));
                  }}
                />
                {LIST_FIELD_LABEL[field]}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

const iconBtn: CSSProperties = {
  width: 22,
  height: 22,
  border: 0,
  borderRadius: 5,
  background: 'transparent',
  color: color.muted,
  cursor: 'pointer',
  font: 'inherit',
};

function FilterBuilder({
  detail,
  labels,
  filters,
  count,
  onChange,
}: {
  detail: ProjectDetail;
  labels: string[];
  filters: FilterCondition[];
  count: number;
  onChange: (filters: FilterCondition[]) => void;
}) {
  const titleId = useId();
  const update = (id: string, patch: Partial<FilterCondition>) => {
    onChange(filters.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  return (
    <div role="dialog" aria-labelledby={titleId} style={{ position: 'absolute', zIndex: 30, top: 40, left: 0, width: 'min(760px, calc(100vw - 48px))', background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.lg, boxShadow: color.shadow, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span id={titleId} className="bt-sr-only">Filter builder</span>
      {filters.map((row, index) => (
        <ConditionRow
          key={row.id}
          index={index}
          row={row}
          detail={detail}
          labels={labels}
          onChange={(patch) => update(row.id, patch)}
          onRemove={() => onChange(filters.filter((f) => f.id !== row.id))}
        />
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: `1px solid ${color.divider}` }}>
        <button type="button" onClick={() => onChange([...filters, { id: newFilterId(), field: 'type', op: 'any', values: [] }])} style={{ height: 32, padding: '0 10px', border: 0, borderRadius: radius.md, background: 'transparent', font: 'inherit', fontSize: 13, fontWeight: 600, color: color.brandStrong, cursor: 'pointer' }}>
          + Add condition
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => onChange([])} style={{ height: 32, padding: '0 10px', border: 0, borderRadius: radius.md, background: 'transparent', font: 'inherit', fontSize: 13, color: color.muted, cursor: 'pointer' }}>
          Clear all
        </button>
        <span style={{ fontSize: 12.5, color: color.ink3 }}><strong>{count}</strong> {count === 1 ? 'task matches' : 'tasks match'}</span>
      </div>
    </div>
  );
}

function ConditionRow({
  index,
  row,
  detail,
  labels,
  onChange,
  onRemove,
}: {
  index: number;
  row: FilterCondition;
  detail: ProjectDetail;
  labels: string[];
  onChange: (patch: Partial<FilterCondition>) => void;
  onRemove: () => void;
}) {
  const ops = opsFor(row.field);
  const choices = row.field === 'assignee' || row.field === 'reporter'
    ? personChoices(detail, row.field)
    : choicesFor(row.field, detail, row.op, labels);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(140px, 180px) minmax(120px, 150px) minmax(0, 1fr) 34px', gap: 8, alignItems: 'center' }}>
      <span style={{ color: color.muted, fontSize: 13 }}>{index === 0 ? 'Where' : 'and'}</span>
      <Select
        aria-label="Field"
        value={row.field}
        options={FILTER_FIELDS.map((field) => ({ value: field, label: fieldLabel(field) }))}
        onChange={(field: FilterField) => {
          const nextOp = opsFor(field)[0] ?? 'is';
          onChange({ field, op: nextOp, values: [] });
        }}
      />
      <Select
        aria-label="Operator"
        value={row.op}
        options={ops.map((op) => ({ value: op, label: opLabel(op) }))}
        onChange={(op: FilterOp) => onChange({ op, values: op === 'empty' ? [] : row.values })}
      />
      <ValueEditor choices={choices} op={row.op} values={row.values} onChange={(values) => onChange({ values })} />
      <button type="button" aria-label="Remove condition" onClick={onRemove} style={{ width: 34, height: 34, border: 0, borderRadius: radius.md, background: 'transparent', color: color.muted, cursor: 'pointer', font: 'inherit' }}>×</button>
    </div>
  );
}

function ValueEditor({
  choices,
  op,
  values,
  onChange,
}: {
  choices: ReturnType<typeof choicesFor>;
  op: FilterOp;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  if (choices === 'none') return <span style={{ fontSize: 13, color: color.muted }}>No value</span>;
  if (choices === 'text') {
    return <Input aria-label="Filter text" value={values[0] ?? ''} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])} placeholder="Words in the title, key or description" />;
  }
  if (choices === 'date') {
    return <Input aria-label="Filter date" type="date" value={values[0] ?? ''} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])} />;
  }
  const multiple = op === 'any' || op === 'not';
  if (multiple) {
    return (
      <Select
        mode="multiple"
        aria-label="Value"
        value={values}
        options={choices}
        onChange={(next: string[]) => onChange(next)}
        style={{ width: '100%' }}
        placeholder="Choose"
      />
    );
  }
  return (
    <Select
      aria-label="Value"
      value={values[0]}
      options={choices}
      onChange={(next: string) => onChange(next ? [next] : [])}
      style={{ width: '100%' }}
      placeholder="Choose"
    />
  );
}

function SaveViewDialog({
  open,
  projectName,
  canShare,
  summary,
  onCancel,
  onSave,
}: {
  open: boolean;
  projectName: string;
  canShare: boolean;
  summary: string[];
  onCancel: () => void;
  onSave: (name: string, visibility: 'me' | 'project') => void;
}) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'me' | 'project'>('me');
  useEffect(() => {
    if (open) {
      setName('');
      setVisibility('me');
    }
  }, [open]);
  return (
    <Modal
      open={open}
      title="Save this view"
      onCancel={onCancel}
      okText="Save view"
      okButtonProps={{ disabled: name.trim().length === 0 }}
      onOk={() => onSave(name.trim(), visibility)}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My open bugs" autoFocus />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {summary.map((item) => (
            <span key={item} style={{ padding: '3px 8px', borderRadius: radius.sm, background: color.chip, fontSize: 12.5, color: color.ink3 }}>{item}</span>
          ))}
        </div>
        <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend style={{ padding: '0 0 6px', fontSize: 13, fontWeight: 500 }}>Who sees it</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 34, fontSize: 13.5 }}>
            <input type="radio" name="view-visibility" checked={visibility === 'me'} onChange={() => setVisibility('me')} />
            Only me
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 34, fontSize: 13.5, color: canShare ? color.ink : color.muted }}>
            <input type="radio" name="view-visibility" checked={visibility === 'project'} disabled={!canShare} onChange={() => setVisibility('project')} />
            Everyone on {projectName} <span style={{ fontSize: 12, color: color.muted }}>(project leads only)</span>
          </label>
        </fieldset>
        <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>Saved in this browser. The address bar keeps the filters, so a link still opens the same list.</p>
      </div>
    </Modal>
  );
}
