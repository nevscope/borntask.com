export type ImportReporterAs = 'importer' | 'original';

export function parseImportReporterAs(raw: unknown): ImportReporterAs {
  return raw === 'original' ? 'original' : 'importer';
}

export const ASANA_API_COLUMNS: Record<string, string> = {
  'Task ID': 'asanaTaskId',
  Name: 'title',
  Notes: 'description',
  'Assignee Email': 'assigneeEmail',
  'Created By Email': 'reporterEmail',
  Followers: 'skip',
  'Section/Column': 'section',
  Tags: 'labels',
  Priority: 'priority',
  Type: 'type',
  'Due Date': 'dueDate',
  'Start Date': 'startDate',
  'Created At': 'createdAt',
  'Completed At': 'completedAt',
  Completed: 'skip',
  'Last Modified': 'updatedAt',
  'Parent task': 'parentAsanaId',
  Permalink: 'skip',
};

export function parseAsanaProjectGid(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const fromPath = value.match(/\/projects?\/(\d+)/i);
  if (fromPath?.[1]) return fromPath[1];
  const fromQuery = value.match(/[?&]project(?:_id)?=(\d+)/i);
  if (fromQuery?.[1]) return fromQuery[1];
  if (/^\d{6,}$/.test(value)) return value;
  return null;
}

export type AsanaImportMapping = {
  source: 'asana_api';
  asanaProjectGid: string;
  sectionsAs: 'sections' | 'statuses';
  reporterAs: ImportReporterAs;
  columns: Record<string, string>;
};

export function isAsanaApiMapping(raw: unknown): raw is AsanaImportMapping {
  return Boolean(raw && typeof raw === 'object' && (raw as { source?: string }).source === 'asana_api');
}
