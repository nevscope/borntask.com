// One filter model for the project list and board. The URL holds the conditions.
import dayjs from 'dayjs';
import type { BuiltinProjectRole, BuiltinTaskType, Priority, ProjectDetail, Task } from '../api/types';
import { priorityStyle, roleStyle, typeStyle } from '../theme/tokens';
import { dueBucket, dueTone } from './dates';
import { stripTags } from './descriptionHtml';
import { statusById } from './workflow';

export const FILTER_FIELDS = [
  'type', 'status', 'category', 'section', 'assignee', 'reporter', 'role',
  'priority', 'label', 'due', 'created', 'updated', 'text',
] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];
export type FilterOp = 'is' | 'any' | 'not' | 'contains' | 'before' | 'after' | 'empty';

export type FilterCondition = {
  id: string;
  field: FilterField;
  op: FilterOp;
  values: string[];
};

export type GroupBy = 'section' | 'status' | 'assignee' | 'priority' | 'none';
export type SortBy = 'manual' | 'due' | 'priority' | 'updated' | 'created' | 'title';
export type ColumnBy = 'status' | 'section' | 'assignee' | 'priority';

export type SavedView = {
  id: string;
  name: string;
  visibility: 'me' | 'project';
  group: GroupBy;
  sort: SortBy;
  filters: FilterCondition[];
};

export type TaskGroup = { id: string; name: string; tasks: Task[] };
export type FilterChoice = { value: string; label: string };

const FIELD_LABEL: Record<FilterField, string> = {
  type: 'Type',
  status: 'Status',
  category: 'Status category',
  section: 'Section',
  assignee: 'Assignee',
  reporter: 'Reporter',
  role: "Assignee's role",
  priority: 'Priority',
  label: 'Labels',
  due: 'Due date',
  created: 'Created',
  updated: 'Updated',
  text: 'Text',
};

const OPS: Record<FilterField, FilterOp[]> = {
  type: ['any', 'is', 'not'],
  status: ['any', 'is', 'not'],
  category: ['is', 'not'],
  section: ['is', 'any', 'not'],
  assignee: ['is', 'not'],
  reporter: ['is', 'not'],
  role: ['is', 'any', 'not'],
  priority: ['is', 'any', 'not'],
  label: ['any', 'is', 'not'],
  due: ['is', 'before', 'after', 'empty'],
  created: ['before', 'after'],
  updated: ['before', 'after'],
  text: ['contains'],
};

const CATEGORY_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  active: 'Active',
  review: 'In review',
  done: 'Done',
};

const DUE_PRESETS: FilterChoice[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'none', label: 'No date' },
];

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

let seq = 0;
export function newFilterId(): string {
  seq += 1;
  return `f${Date.now().toString(36)}${seq}`;
}

export function defaultFilters(): FilterCondition[] {
  return [{ id: 'hide-done', field: 'category', op: 'not', values: ['done'] }];
}

export function fieldLabel(field: FilterField): string {
  return FIELD_LABEL[field];
}

export function opsFor(field: FilterField): FilterOp[] {
  return OPS[field];
}

export function opLabel(op: FilterOp): string {
  if (op === 'any') return 'is any of';
  if (op === 'not') return 'is not';
  if (op === 'contains') return 'contains';
  if (op === 'before') return 'before';
  if (op === 'after') return 'after';
  if (op === 'empty') return 'is empty';
  return 'is';
}

function isField(value: string): value is FilterField {
  return (FILTER_FIELDS as readonly string[]).includes(value);
}

function isOp(value: string): value is FilterOp {
  return value === 'is' || value === 'any' || value === 'not' || value === 'contains' || value === 'before' || value === 'after' || value === 'empty';
}

function isGroup(value: string): value is GroupBy {
  return value === 'section' || value === 'status' || value === 'assignee' || value === 'priority' || value === 'none';
}

function isSort(value: string): value is SortBy {
  return value === 'manual' || value === 'due' || value === 'priority' || value === 'updated' || value === 'created' || value === 'title';
}

function isColumns(value: string): value is ColumnBy {
  return value === 'status' || value === 'section' || value === 'assignee' || value === 'priority';
}

export function readGroup(raw: string | null): GroupBy {
  return raw && isGroup(raw) ? raw : 'section';
}

export function readSort(raw: string | null): SortBy {
  return raw && isSort(raw) ? raw : 'manual';
}

export function readColumns(raw: string | null): ColumnBy {
  return raw && isColumns(raw) ? raw : 'status';
}

export function encodeFilters(filters: FilterCondition[]): string {
  return filters
    .map((f) => `${f.field}:${f.op}:${f.values.map((v) => encodeURIComponent(v)).join(',')}`)
    .join(';');
}

export function decodeFilters(raw: string): FilterCondition[] {
  if (!raw) return [];
  const out: FilterCondition[] = [];
  for (const part of raw.split(';')) {
    const first = part.indexOf(':');
    const second = part.indexOf(':', first + 1);
    if (first < 0 || second < 0) continue;
    const field = part.slice(0, first);
    const op = part.slice(first + 1, second);
    if (!isField(field) || !isOp(op)) continue;
    const values = part.slice(second + 1).split(',').filter(Boolean).map((v) => {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    });
    out.push({ id: `url-${out.length}:${field}:${op}`, field, op, values });
  }
  return out;
}

export function choicesFor(field: FilterField, detail: ProjectDetail, op: FilterOp, labels: string[] = []): FilterChoice[] | 'text' | 'date' | 'none' {
  if (op === 'empty') return 'none';
  if (field === 'text') return 'text';
  if (field === 'created' || field === 'updated') return 'date';
  if (field === 'due') return op === 'is' ? DUE_PRESETS : 'date';
  if (field === 'type') return (Object.keys(typeStyle) as BuiltinTaskType[]).map((t) => ({ value: t, label: typeStyle[t].label }));
  if (field === 'status') return detail.workflow.statuses.map((s) => ({ value: s.id, label: s.name }));
  if (field === 'category') return Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
  if (field === 'section') return detail.sections.map((s) => ({ value: s.id, label: s.name }));
  if (field === 'priority') return (Object.keys(priorityStyle) as Priority[]).map((p) => ({ value: p, label: priorityStyle[p].label }));
  if (field === 'role') return (Object.keys(roleStyle) as BuiltinProjectRole[]).map((r) => ({ value: r, label: roleStyle[r].label }));
  if (field === 'label') return [...new Set(labels)].sort((a, b) => a.localeCompare(b, 'en-GB')).map((value) => ({ value, label: value }));
  return [];
}

export function personChoices(detail: ProjectDetail, field: 'assignee' | 'reporter'): FilterChoice[] {
  const people = detail.members
    .map((m) => detail.users.find((u) => u.id === m.userId))
    .filter((u) => !!u)
    .map((u) => ({ value: u.id, label: u.name }));
  const me = { value: 'me', label: 'Me' };
  if (field === 'assignee') return [me, { value: 'none', label: 'Unassigned' }, ...people];
  return [me, ...people];
}

function valueLabel(field: FilterField, value: string, detail: ProjectDetail): string {
  if (field === 'type' && value in typeStyle) return typeStyle[value as BuiltinTaskType].label;
  if (field === 'priority' && value in priorityStyle) return priorityStyle[value as Priority].label;
  if (field === 'role' && value in roleStyle) return roleStyle[value as BuiltinProjectRole].label;
  if (field === 'category') return CATEGORY_LABEL[value] ?? value;
  if (field === 'status') return statusById(detail.workflow, value)?.name ?? value;
  if (field === 'section') return detail.sections.find((s) => s.id === value)?.name ?? value;
  if (field === 'assignee' || field === 'reporter') {
    if (value === 'me') return 'Me';
    if (value === 'none') return 'Unassigned';
    return detail.users.find((u) => u.id === value)?.name ?? value;
  }
  if (field === 'due') return DUE_PRESETS.find((p) => p.value === value)?.label ?? value;
  return value;
}

export function chipLabel(condition: FilterCondition, detail: ProjectDetail): string {
  const name = FIELD_LABEL[condition.field];
  if (condition.op === 'empty') return `${name} is empty`;
  const vals = condition.values.map((v) => valueLabel(condition.field, v, detail)).join(', ');
  const shown = vals || '…';
  if (condition.op === 'any') return `${name}: ${shown}`;
  if (condition.op === 'not') return `${name} is not ${shown}`;
  if (condition.op === 'contains') return `${name} contains ${shown}`;
  if (condition.op === 'before') return `${name} before ${shown}`;
  if (condition.op === 'after') return `${name} after ${shown}`;
  return `${name} is ${shown}`;
}

function personHit(task: Task, field: 'assignee' | 'reporter', values: string[], meId: string | undefined): boolean {
  return values.some((v) => {
    if (v === 'me') return !!meId && (field === 'assignee' ? task.assigneeId === meId : task.reporterId === meId);
    if (v === 'none') return field === 'assignee' && task.assigneeId === null;
    return field === 'assignee' ? task.assigneeId === v : task.reporterId === v;
  });
}

function dueHit(task: Task, op: FilterOp, values: string[]): boolean {
  if (op === 'empty') return !task.dueDate;
  const value = values[0];
  if (!value) return true;
  if (op === 'is') {
    if (value === 'none') return !task.dueDate;
    if (value === 'overdue') return dueTone(task.dueDate) === 'overdue';
    if (value === 'today') return dueTone(task.dueDate) === 'today';
    if (value === 'week') {
      const bucket = dueBucket(task.dueDate);
      return bucket === 'today' || bucket === 'week';
    }
    return false;
  }
  if (!task.dueDate) return false;
  if (op === 'before') return task.dueDate < value;
  if (op === 'after') return task.dueDate > value;
  return true;
}

function whenHit(iso: string, op: FilterOp, values: string[]): boolean {
  const value = values[0];
  if (!value) return true;
  const day = dayjs(iso).format('YYYY-MM-DD');
  if (op === 'before') return day < value;
  if (op === 'after') return day > value;
  return true;
}

function listHit(have: string[], values: string[], op: FilterOp): boolean {
  if (values.length === 0) return true;
  const hit = values.some((v) => have.includes(v));
  return op === 'not' ? !hit : hit;
}

export function taskMatches(task: Task, filters: FilterCondition[], detail: ProjectDetail, meId: string | undefined): boolean {
  return filters.every((f) => {
    if (f.op !== 'empty' && f.values.length === 0) return true;
    if (f.field === 'type') return listHit([task.type], f.values, f.op);
    if (f.field === 'status') return listHit([task.statusId], f.values, f.op);
    if (f.field === 'category') return listHit([statusById(detail.workflow, task.statusId)?.category ?? ''], f.values, f.op);
    if (f.field === 'section') return listHit([task.sectionId], f.values, f.op);
    if (f.field === 'priority') return listHit([task.priority], f.values, f.op);
    if (f.field === 'label') return listHit(task.labels, f.values, f.op);
    if (f.field === 'role') {
      const roles = task.assigneeId ? detail.members.find((m) => m.userId === task.assigneeId)?.roles ?? [] : [];
      return listHit(roles, f.values, f.op);
    }
    if (f.field === 'assignee' || f.field === 'reporter') {
      const hit = personHit(task, f.field, f.values, meId);
      return f.op === 'not' ? !hit : hit;
    }
    if (f.field === 'due') return dueHit(task, f.op, f.values);
    if (f.field === 'created') return whenHit(task.createdAt, f.op, f.values);
    if (f.field === 'updated') return whenHit(task.updatedAt, f.op, f.values);
    const needle = (f.values[0] ?? '').trim().toLowerCase();
    if (!needle) return true;
    return `${task.key} ${task.title} ${stripTags(task.description)}`.toLowerCase().includes(needle);
  });
}

export function sortTasks(tasks: Task[], sort: SortBy): Task[] {
  const list = [...tasks];
  if (sort === 'manual') return list.sort((a, b) => a.position - b.position);
  if (sort === 'due') return list.sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'));
  if (sort === 'priority') return list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  if (sort === 'updated') return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (sort === 'created') return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list.sort((a, b) => a.title.localeCompare(b.title, 'en-GB'));
}

/** Keep group headers, but only the first `limit` tasks in display order. */
export function takeGroupedTasks(groups: TaskGroup[], limit: number): Array<TaskGroup & { total: number }> {
  let left = limit;
  const out: Array<TaskGroup & { total: number }> = [];
  for (const group of groups) {
    if (left <= 0) break;
    const tasks = group.tasks.slice(0, left);
    out.push({ ...group, tasks, total: group.tasks.length });
    left -= tasks.length;
  }
  return out;
}

export function groupTasks(tasks: Task[], group: GroupBy, detail: ProjectDetail): TaskGroup[] {
  if (group === 'none') return [{ id: 'all', name: 'All tasks', tasks }];
  if (group === 'section') {
    const known = new Set(detail.sections.map((s) => s.id));
    const groups = detail.sections.map((s) => ({ id: s.id, name: s.name, tasks: tasks.filter((t) => t.sectionId === s.id) }));
    const other = tasks.filter((t) => !known.has(t.sectionId));
    if (other.length) groups.push({ id: 'other', name: 'Other', tasks: other });
    return groups;
  }
  if (group === 'status') {
    return [...detail.workflow.statuses]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, name: s.name, tasks: tasks.filter((t) => t.statusId === s.id) }));
  }
  if (group === 'priority') {
    return (Object.keys(priorityStyle) as Priority[])
      .map((p) => ({ id: p, name: priorityStyle[p].label, tasks: tasks.filter((t) => t.priority === p) }))
      .filter((g) => g.tasks.length > 0);
  }
  const ids = [...new Set(tasks.map((t) => t.assigneeId ?? 'none'))];
  return ids.map((id) => ({
    id,
    name: id === 'none' ? 'Unassigned' : detail.users.find((u) => u.id === id)?.name ?? 'Unknown',
    tasks: tasks.filter((t) => (t.assigneeId ?? 'none') === id),
  }));
}

const VIEW_KEY = (workspaceId: string, projectKey: string) => `bt.views.${workspaceId}.${projectKey}`;

function isSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SavedView>;
  return typeof row.id === 'string' && typeof row.name === 'string' && Array.isArray(row.filters)
    && (row.visibility === 'me' || row.visibility === 'project')
    && !!row.group && isGroup(row.group) && !!row.sort && isSort(row.sort);
}

export function readSavedViews(workspaceId: string, projectKey: string): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEW_KEY(workspaceId, projectKey));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

export function writeSavedViews(workspaceId: string, projectKey: string, views: SavedView[]): void {
  localStorage.setItem(VIEW_KEY(workspaceId, projectKey), JSON.stringify(views));
}
