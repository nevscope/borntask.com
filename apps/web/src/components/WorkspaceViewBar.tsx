import { Input, Modal } from 'antd';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProjectDetail } from '../api/types';
import { FilterBuilder } from './ProjectViewBar';
import { ConfirmDialog } from './ConfirmDialog';
import { useBackLayer } from '../lib/backLayer';
import { useIsPhone } from '../hooks/useIsPhone';
import {
  activeWorkspacePresetId,
  chipLabel,
  decodeFilters,
  encodeFilters,
  fieldLabel,
  newFilterId,
  readLastWorkspaceView,
  readSort,
  readWorkspaceGroup,
  readWorkspaceViews,
  WORKSPACE_PRESET_VIEWS,
  writeLastWorkspaceView,
  writeWorkspaceViews,
  type FilterCondition,
  type SortBy,
  type WorkspaceGroup,
  type WorkspaceSavedView,
} from '../lib/taskFilters';
import { color, radius } from '../theme/tokens';

export type WorkspaceView = {
  filters: FilterCondition[];
  group: WorkspaceGroup;
  sort: SortBy;
  viewId: string | null;
};

const URL_KEYS = ['f', 'view', 'group', 'sort'] as const;

const DEFAULT = WORKSPACE_PRESET_VIEWS[0]!;

export function useWorkspaceView(workspaceId: string): WorkspaceView & { setView: (patch: Partial<WorkspaceView>) => void } {
  const [params, setParams] = useSearchParams();
  const hasUrlView = URL_KEYS.some((key) => params.has(key));
  const last = !hasUrlView ? readLastWorkspaceView(workspaceId) : null;
  const rawFilters = params.get('f');
  const filters = hasUrlView
    ? (rawFilters === null ? DEFAULT.filters : decodeFilters(rawFilters))
    : (last?.filters ?? DEFAULT.filters);
  const group = hasUrlView ? readWorkspaceGroup(params.get('group')) : (last?.group ?? DEFAULT.group);
  const sort = hasUrlView ? readSort(params.get('sort')) : (last?.sort ?? DEFAULT.sort);
  const viewId = hasUrlView ? params.get('view') : (last?.viewId ?? DEFAULT.id);

  useEffect(() => {
    if (!workspaceId) return;
    writeLastWorkspaceView(workspaceId, { filters, group, sort, viewId });
  }, [workspaceId, encodeFilters(filters), group, sort, viewId]);

  const setView = (patch: Partial<WorkspaceView>) => {
    const merged: WorkspaceView = { filters, group, sort, viewId, ...patch };
    if (workspaceId) writeLastWorkspaceView(workspaceId, merged);
    const next = new URLSearchParams(params);
    next.set('f', encodeFilters(merged.filters));
    next.set('group', merged.group);
    next.set('sort', merged.sort);
    if (merged.viewId) next.set('view', merged.viewId);
    else next.delete('view');
    setParams(next, { replace: true });
  };

  return { filters, group, sort, viewId, setView };
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

export function WorkspaceViewBar({
  workspaceId,
  detail,
  labels,
  count,
  view,
  onView,
}: {
  workspaceId: string;
  detail: ProjectDetail;
  labels: string[];
  count: number;
  view: WorkspaceView;
  onView: (patch: Partial<WorkspaceView>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<WorkspaceSavedView | null>(null);
  const isPhone = useIsPhone();
  useBackLayer(open, () => setOpen(false));
  useBackLayer(saving, () => setSaving(false));
  const [views, setViews] = useState<WorkspaceSavedView[]>(() => readWorkspaceViews(workspaceId));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViews(readWorkspaceViews(workspaceId));
  }, [workspaceId]);

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

  const change = (patch: Partial<WorkspaceView>) => onView({ ...patch, viewId: null });
  const selectedPreset = activeWorkspacePresetId(view.filters, view.viewId);

  const removeSaved = (id: string) => {
    const next = views.filter((row) => row.id !== id);
    setViews(next);
    writeWorkspaceViews(workspaceId, next);
    if (view.viewId === id) onView({ viewId: null });
  };

  const save = () => {
    const saved: WorkspaceSavedView = {
      id: newFilterId(),
      name: name.trim(),
      group: view.group,
      sort: view.sort,
      filters: view.filters,
    };
    const next = [...views, saved];
    setViews(next);
    writeWorkspaceViews(workspaceId, next);
    onView({ viewId: saved.id });
    setSaving(false);
    setName('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {WORKSPACE_PRESET_VIEWS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onView({ filters: preset.filters, group: preset.group, sort: preset.sort, viewId: preset.id })}
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
                onClick={() => onView({ filters: saved.filters, group: saved.group, sort: saved.sort, viewId: saved.id })}
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
        </div>
        <div ref={panelRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} style={{ ...controlStyle, display: 'inline-flex', alignItems: 'center', gap: 6, color: color.ink3, cursor: 'pointer' }}>
            Filter
          </button>
          {open && (
            <FilterBuilder
              detail={detail}
              labels={labels}
              filters={view.filters}
              count={count}
              onChange={(filters) => change({ filters })}
              open={open}
            />
          )}
        </div>
        {view.filters.map((condition) => (
          <span key={condition.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 6px 0 10px', borderRadius: radius.md, background: color.brandTint, color: color.brandStrong, fontSize: 13, fontWeight: 500 }}>
            {chipLabel(condition, detail)}
            <button type="button" aria-label={`Remove ${fieldLabel(condition.field, detail)} filter`} onClick={() => change({ filters: view.filters.filter((row) => row.id !== condition.id) })} style={{ ...iconBtn, color: color.brandStrong }}>×</button>
          </span>
        ))}
        {!isPhone && (
          <>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: color.muted }}>Group</span>
            <select aria-label="Group" value={view.group} onChange={(e) => change({ group: readWorkspaceGroup(e.target.value) })} style={controlStyle}>
              <option value="project">Project</option>
              <option value="status">Status</option>
              <option value="assignee">Assignee</option>
              <option value="none">None</option>
            </select>
            <span style={{ fontSize: 13, color: color.muted }}>Sort</span>
            <select aria-label="Sort" value={view.sort} onChange={(e) => change({ sort: readSort(e.target.value) })} style={controlStyle}>
              <option value="updated">Updated</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
              <option value="created">Created</option>
              <option value="title">Title</option>
            </select>
          </>
        )}
      </div>
      <Modal
        open={saving}
        title="Save this view"
        onCancel={() => setSaving(false)}
        okText="Save view"
        okButtonProps={{ disabled: name.trim().length === 0 }}
        onOk={save}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Waiting for testing" autoFocus />
          </label>
          <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>
            Saved in this browser for the whole workspace. The address bar keeps the filters, so a link still opens the same list.
          </p>
        </div>
      </Modal>
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
