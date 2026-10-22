import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FilterCondition, FilterField } from '../lib/taskFilters';
import { color } from '../theme/tokens';

export function ListColumnHead({
  label,
  width,
  field,
  filters,
  choices,
  onFilters,
}: {
  label: string;
  width?: number;
  field: FilterField | 'title';
  filters: FilterCondition[];
  choices?: { value: string; label: string }[];
  onFilters: (filters: FilterCondition[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const active = filters.some((row) => (field === 'title' ? row.field === 'text' : row.field === field) && row.values.length > 0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const apply = (values: string[], op: FilterCondition['op'] = field === 'title' ? 'contains' : 'any') => {
    const nextField: FilterField = field === 'title' ? 'text' : field;
    const rest = filters.filter((row) => row.field !== nextField);
    onFilters(values.length ? [...rest, { id: `col-${nextField}`, field: nextField, op, values }] : rest);
    setOpen(false);
  };

  const needle = q.trim().toLowerCase();
  const rows = (choices ?? []).filter((item) => !needle || item.label.toLowerCase().includes(needle));

  return (
    <span ref={box} style={{ width, position: 'relative', flex: width ? 'none' : '1 1 240px', minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          height: 28,
          padding: 0,
          border: 0,
          background: 'transparent',
          font: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          color: active ? color.brandStrong : color.muted,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 28, left: 0, zIndex: 24, width: 220, padding: 8, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, boxShadow: color.shadow }}>
          <input
            autoFocus
            value={q}
            aria-label={`Search ${label}`}
            placeholder={`Search ${label.toLowerCase()}`}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && field === 'title') apply([q], 'contains');
            }}
            style={{ width: '100%', height: 32, marginBottom: 6, padding: '0 8px', border: `1px solid ${color.border}`, borderRadius: 8, font: 'inherit', fontSize: 13 }}
          />
          {field === 'title' ? (
            <HeadRow onClick={() => apply(q.trim() ? [q.trim()] : [], 'contains')}>{q.trim() ? `Tasks matching “${q.trim()}”` : 'Clear title search'}</HeadRow>
          ) : (
            <>
              <HeadRow onClick={() => apply([])}>Any {label.toLowerCase()}</HeadRow>
              {rows.map((item) => (
                <HeadRow key={item.value} onClick={() => apply([item.value], 'is')}>{item.label}</HeadRow>
              ))}
              {rows.length === 0 && <span style={{ display: 'block', padding: '6px 8px', fontSize: 12.5, color: color.muted }}>Nothing matches.</span>}
            </>
          )}
        </div>
      )}
    </span>
  );
}

function HeadRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: 'block', width: '100%', minHeight: 32, padding: '0 8px', border: 0, borderRadius: 8, background: 'transparent', font: 'inherit', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

