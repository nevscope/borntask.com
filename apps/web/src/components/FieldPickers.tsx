import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMe } from '../api/queries';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { useWorkspaceCatalog } from '../api/catalog';
import type { BuiltinProjectRole, BuiltinTaskType, Priority, ProjectDetail, TaskType, User, WorkflowStatus } from '../api/types';
import { dueLabel, parseDuePhrase } from '../lib/dates';
import { rolesLabel, type MoveCheck } from '../lib/workflow';
import { useBackLayer } from '../lib/backLayer';
import { color, priorityStyle, roleStyle, typeStyle } from '../theme/tokens';
import { Avatar, LockIcon, StatusDot, TypeTag } from './Chips';

type StatusOption = {
  status: WorkflowStatus;
  check: MoveCheck;
};

const TYPE_HINT: Record<BuiltinTaskType, string> = {
  idea: 'Not yet approved',
  bug: 'Something is broken',
  improvement: 'Make something better',
  feature: 'Something new',
};

const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

export function TypePicker({ value, onChange, bare, trigger, allowed }: { value: TaskType; onChange: (type: TaskType) => void; bare?: boolean; trigger?: ReactNode; allowed?: string[] }) {
  const catalog = useWorkspaceCatalog();
  const types = (catalog.types.length
    ? catalog.types.map((item) => ({ id: item.slug, name: item.name, hint: item.slug in TYPE_HINT ? TYPE_HINT[item.slug as BuiltinTaskType] : '' }))
    : (Object.keys(typeStyle) as BuiltinTaskType[]).map((type) => ({ id: type, name: typeStyle[type].label, hint: TYPE_HINT[type] }))
  ).filter((type) => !allowed || allowed.includes(type.id) || type.id === value);
  return (
    <Picker bare={bare} label={trigger ?? <TypeTag type={value} />} ariaLabel="Change type">
      {(close) => (
        <FilterList
          label="Find a type"
          items={types.map((type) => ({
            id: type.id,
            text: `${type.name} ${type.hint}`,
            node: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <TypeTag type={type.id} />
                <span style={{ flex: 1, fontSize: 12.5, color: color.muted }}>{type.hint}</span>
              </span>
            ),
          }))}
          onPick={(id) => { onChange(id); close(); }}
        />
      )}
    </Picker>
  );
}

export function AssigneePicker({
  value,
  users,
  detail,
  meId,
  onChange,
  bare,
  trigger,
}: {
  value: string | null;
  users: User[];
  detail: ProjectDetail;
  meId?: string;
  onChange: (userId: string | null) => void;
  bare?: boolean;
  trigger?: ReactNode;
}) {
  const me = useMe().data;
  const selfId = meId ?? me?.user.id;
  const people = useMemo(() => {
    if (!me?.user || users.some((user) => user.id === me.user.id)) return users;
    return [me.user, ...users];
  }, [users, me]);
  const current = people.find((user) => user.id === value);
  return (
    <Picker
      bare={bare}
      label={trigger ?? (current ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar user={current} size={20} />{current.name}</span> : 'Unassigned')}
      ariaLabel="Change assignee"
      onKey={(key, close) => {
        if (key.toLowerCase() !== 'i' || !selfId) return false;
        onChange(selfId);
        close();
        return true;
      }}
    >
      {(close) => (
        <AssigneeList users={people} detail={detail} meId={selfId} selected={value} onChange={(id) => { onChange(id); close(); }} />
      )}
    </Picker>
  );
}

function AssigneeList({
  users,
  detail,
  meId,
  selected,
  onChange,
}: {
  users: User[];
  detail: ProjectDetail;
  meId?: string;
  selected: string | null;
  onChange: (id: string | null) => void;
}) {
  const me = useMe().data;
  const selfId = meId ?? me?.user.id;
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const matches = (user: User) => {
    if (!needle) return true;
    const hay = `${user.name} ${user.email}`.toLowerCase();
    return needle.split(/\s+/).every((part) => hay.includes(part));
  };
  const rows = users.filter(matches);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }} onMouseDown={(event) => event.stopPropagation()}>
      <FilterBox label="Find a person" value={q} onChange={setQ} passthroughKeys={q ? [] : ['i']} autoFocus={false} />
      {selfId && (
        <RowButton onClick={() => onChange(selfId)}>
          <span style={{ flex: 1 }}>Assign to me</span>
          <kbd className="bt-kbd">I</kbd>
        </RowButton>
      )}
      {rows.map((user) => {
        const roles = detail.members.find((member) => member.userId === user.id)?.roles ?? [];
        return (
          <RowButton key={user.id} active={user.id === selected} onClick={() => onChange(user.id)}>
            <Avatar user={user} size={24} />
            <span style={{ flex: 1 }}>{user.name}</span>
            <span style={{ fontSize: 12, color: color.muted }}>{roles[0] && roles[0] in roleStyle ? roleStyle[roles[0] as BuiltinProjectRole].label : roles[0] ?? 'Member'}</span>
          </RowButton>
        );
      })}
      {rows.length === 0 && <span style={{ padding: '6px 10px', fontSize: 12.5, color: color.muted }}>No one matches.</span>}
      <div style={{ height: 1, margin: '4px 6px', background: color.divider }} />
      <RowButton onClick={() => onChange(null)}>Unassigned</RowButton>
    </div>
  );
}

export function DuePicker({ value, onChange, bare, trigger }: { value: string | null; onChange: (date: string | null) => void; bare?: boolean; trigger?: ReactNode }) {
  return (
    <Picker bare={bare} label={trigger ?? dueLabel(value)} ariaLabel="Change due date">
      {(close) => <DuePanel value={value} onChange={(date) => { onChange(date); close(); }} />}
    </Picker>
  );
}

function DuePanel({ value, onChange }: { value: string | null; onChange: (date: string | null) => void }) {
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(() => dayjs(value ?? undefined).startOf('month'));
  const parsed = parseDuePhrase(text);
  const first = cursor.startOf('month');
  const lead = (first.day() + 6) % 7;
  const start = first.subtract(lead, 'day');
  const days = Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 6 }}>
      <FilterBox label="Type a date" value={text} onChange={setText} hint={parsed ? dueLabel(parsed) : undefined} onEnter={() => parsed && onChange(parsed)} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Mini onClick={() => onChange(dayjs().format('YYYY-MM-DD'))}>Today</Mini>
        <Mini onClick={() => onChange(dayjs().add(1, 'day').format('YYYY-MM-DD'))}>Tomorrow</Mini>
        <Mini onClick={() => onChange(parseDuePhrase('next monday'))}>Next Monday</Mini>
        <Mini onClick={() => onChange(null)}>No date</Mini>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600 }}>
        <button type="button" aria-label="Previous month" onClick={() => setCursor((month) => month.subtract(1, 'month'))} style={iconBtn}>‹</button>
        {cursor.format('MMMM YYYY')}
        <button type="button" aria-label="Next month" onClick={() => setCursor((month) => month.add(1, 'month'))} style={iconBtn}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, textAlign: 'center', fontSize: 12.5 }}>
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => <span key={day} style={{ padding: '4px 0', color: color.muted, fontSize: 11.5 }}>{day}</span>)}
        {days.map((day) => {
          const iso = day.format('YYYY-MM-DD');
          const selected = value === iso;
          const today = day.isSame(dayjs(), 'day');
          const outside = !day.isSame(cursor, 'month');
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              style={{
                height: 32,
                border: today && !selected ? `1px solid ${color.brand}` : 0,
                borderRadius: 8,
                background: selected ? color.brand : 'transparent',
                color: selected ? color.surface : outside ? color.faint : color.ink,
                font: 'inherit',
                fontWeight: selected || today ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {day.date()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PriorityPicker({ value, onChange, bare, trigger }: { value: Priority; onChange: (priority: Priority) => void; bare?: boolean; trigger?: ReactNode }) {
  return (
    <Picker
      bare={bare}
      label={trigger ?? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: priorityStyle[value].color }} />{priorityStyle[value].label}</span>}
      ariaLabel="Change priority"
      onKey={(key, close) => {
        const hit = PRIORITIES.find((priority) => priorityStyle[priority].key === key);
        if (!hit) return false;
        onChange(hit);
        close();
        return true;
      }}
    >
      {(close) => (
        <div role="menu" aria-label="Priority">
          {PRIORITIES.map((priority) => (
            <RowButton key={priority} active={priority === value} onClick={() => { onChange(priority); close(); }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: priorityStyle[priority].color }} />
              <span style={{ flex: 1 }}>{priorityStyle[priority].label}</span>
              <kbd className="bt-kbd">{priorityStyle[priority].key}</kbd>
            </RowButton>
          ))}
        </div>
      )}
    </Picker>
  );
}

export function LabelPicker({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (labels: string[]) => void }) {
  const summary = value.length ? value.join(', ') : 'Add labels';
  return (
    <Picker label={summary} ariaLabel="Labels">
      {(close) => <LabelList value={value} suggestions={suggestions} onChange={onChange} onDone={close} />}
    </Picker>
  );
}

function LabelList({ value, suggestions, onChange, onDone }: { value: string[]; suggestions: string[]; onChange: (labels: string[]) => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const known = useMemo(() => [...new Set([...suggestions, ...value])].sort((a, b) => a.localeCompare(b)), [suggestions, value]);
  const needle = q.trim().toLowerCase();
  const rows = known.filter((label) => !needle || label.toLowerCase().includes(needle));
  const canCreate = q.trim().length > 0 && !known.some((label) => label.toLowerCase() === q.trim().toLowerCase());
  const toggle = (label: string) => {
    onChange(value.includes(label) ? value.filter((item) => item !== label) : [...value, label]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FilterBox label="Find or create a label" value={q} onChange={setQ} />
      {rows.map((label) => (
        <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, padding: '0 10px', borderRadius: 8, fontSize: 13.5 }}>
          <input type="checkbox" checked={value.includes(label)} onChange={() => toggle(label)} />
          {label}
        </label>
      ))}
      {canCreate && (
        <RowButton onClick={() => { onChange([...value, q.trim()]); setQ(''); onDone(); }}>
          <span style={{ color: color.brandStrong, fontWeight: 600 }}>Create label "{q.trim()}"</span>
        </RowButton>
      )}
    </div>
  );
}

export function StatusMenu({
  name,
  dot,
  options,
  onMove,
  bare,
  trigger,
}: {
  name: string;
  dot: ReactNode;
  options: StatusOption[];
  onMove: (statusId: string) => void;
  bare?: boolean;
  trigger?: ReactNode;
}) {
  return (
    <Picker bare={bare} label={trigger ?? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{dot}{name}</span>} ariaLabel={`Change status from ${name}`} pill={!bare}>
      {(close) => (
        <FilterList
          label="Find a status"
          items={options.map((option) => ({
            id: option.status.id,
            text: option.status.name,
            disabled: option.check.kind !== 'allowed',
            node: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <StatusDot status={option.status} />
                <span style={{ flex: 1 }}>{option.status.name}</span>
                <span style={{ fontSize: 12, color: color.muted }}>
                  {option.check.kind === 'allowed'
                    ? option.check.transition.label ?? ''
                    : option.check.kind === 'not-allowed'
                      ? <><LockIcon /> {rolesLabel(option.check.transition.roles)}</>
                      : ''}
                </span>
              </span>
            ),
          }))}
          onPick={(id) => { onMove(id); close(); }}
        />
      )}
    </Picker>
  );
}

function placeMenu(rect: DOMRect): { top: number; left: number; up: boolean; maxHeight: number } {
  const width = Math.min(320, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const up = spaceBelow < 280 && spaceAbove > spaceBelow;
  return { top: up ? rect.top - 6 : rect.bottom + 6, left, up, maxHeight: Math.min(440, Math.max(120, up ? spaceAbove : spaceBelow)) };
}

export function MenuPicker({
  label,
  ariaLabel,
  items,
  onPick,
}: {
  label: ReactNode;
  ariaLabel: string;
  items: { id: string; label: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <Picker bare label={label} ariaLabel={ariaLabel}>
      {(close) => (
        <div role="menu" aria-label={ariaLabel}>
          {items.map((item) => (
            <RowButton key={item.id} onClick={() => { onPick(item.id); close(); }}>{item.label}</RowButton>
          ))}
          {items.length === 0 && <span style={{ padding: '6px 10px', fontSize: 12.5, color: color.muted }}>Nothing to choose.</span>}
        </div>
      )}
    </Picker>
  );
}

function Picker({
  label,
  ariaLabel,
  pill = false,
  bare = false,
  onKey,
  children,
}: {
  label: ReactNode;
  ariaLabel: string;
  pill?: boolean;
  bare?: boolean;
  onKey?: (key: string, close: () => void) => boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false, maxHeight: 440 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useBackLayer(open, close);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const node = event.target as Node;
      if (ref.current?.contains(node) || menuRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (!typing && onKey?.(event.key, close)) event.preventDefault();
    };
    const onReflow = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setPos(placeMenu(rect));
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onEscape);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onEscape);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, onKey]);
  const menu = open ? (
    <div
      ref={menuRef}
      role="dialog"
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        zIndex: 1200,
        top: pos.top,
        left: pos.left,
        transform: pos.up ? 'translateY(-100%)' : undefined,
        width: 320,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: pos.maxHeight,
        overflow: 'auto',
        padding: 6,
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: 12,
      }}
    >
      {children(close)}
    </div>
  ) : null;
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0, maxWidth: '100%', width: bare ? undefined : '100%' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const rect = btnRef.current?.getBoundingClientRect();
          if (rect) setPos(placeMenu(rect));
          setOpen((value) => !value);
        }}
        style={bare ? {
          display: 'inline-flex',
          alignItems: 'center',
          maxWidth: '100%',
          minHeight: 28,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
        } : {
          display: 'inline-flex',
          alignItems: 'center',
          width: '100%',
          minHeight: 32,
          maxWidth: '100%',
          padding: pill ? '0 12px' : '0 10px',
          border: `1px solid ${color.border}`,
          borderRadius: pill ? 999 : 8,
          background: color.surface,
          color: color.ink,
          font: 'inherit',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}

function FilterList({
  label,
  items,
  onPick,
}: {
  label: string;
  items: { id: string; text: string; node: ReactNode; disabled?: boolean }[];
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = items.filter((item) => !needle || item.text.toLowerCase().includes(needle));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FilterBox label={label} value={q} onChange={setQ} />
      {rows.map((item) => (
        <RowButton key={item.id} disabled={item.disabled} onClick={() => onPick(item.id)}>{item.node}</RowButton>
      ))}
      {rows.length === 0 && <span style={{ padding: '6px 10px', fontSize: 12.5, color: color.muted }}>Nothing matches.</span>}
    </div>
  );
}

function FilterBox({ label, value, onChange, hint, onEnter, passthroughKeys = [], autoFocus = true }: { label: string; value: string; onChange: (value: string) => void; hint?: string; onEnter?: () => void; passthroughKeys?: string[]; autoFocus?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, marginBottom: 4, padding: '0 10px', border: `1px solid ${color.border}`, borderRadius: 8 }}>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (passthroughKeys.includes(event.key.toLowerCase()) && !value) return;
          event.stopPropagation();
          if (event.key === 'Enter') onEnter?.();
        }}
        style={{ flex: 1, minWidth: 0, border: 0, font: 'inherit', fontSize: 13.5, outline: 'none', background: 'transparent' }}
      />
      {hint && <span style={{ fontSize: 12.5, color: color.brandStrong, fontWeight: 600 }}>{hint}</span>}
    </label>
  );
}

function RowButton({ children, onClick, active = false, disabled = false }: { children: ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 36,
        width: '100%',
        padding: '0 10px',
        border: 0,
        borderRadius: 8,
        background: active ? color.brandTint : 'transparent',
        color: disabled ? color.faint : color.ink,
        font: 'inherit',
        fontSize: 13.5,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Mini({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 30, padding: '0 10px', border: `1px solid ${color.border}`, borderRadius: 6, background: color.surface, font: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>
      {children}
    </button>
  );
}

const iconBtn = {
  width: 30,
  height: 30,
  border: 0,
  borderRadius: 6,
  background: 'transparent',
  font: 'inherit',
  cursor: 'pointer',
} as const;
