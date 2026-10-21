export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

const FIELD_HINTS: Record<string, string[]> = {
  asanaTaskId: ['task id', 'asana task id', 'taskid'],
  title: ['name', 'task name', 'title'],
  description: ['notes', 'description'],
  assigneeEmail: ['assignee email', 'assignee', 'email'],
  section: ['section/column', 'section', 'column'],
  status: ['status'],
  dueDate: ['due date', 'due'],
  startDate: ['start date', 'start'],
  createdAt: ['created at', 'created'],
  completedAt: ['completed at', 'completed'],
  updatedAt: ['last modified', 'modified at', 'last modified at'],
  labels: ['tags', 'labels'],
  priority: ['priority'],
  type: ['type'],
  parentAsanaId: ['parent task id', 'parent id'],
};

export function guessField(header: string): string {
  const h = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(FIELD_HINTS)) {
    if (aliases.some((a) => h === a || h.includes(a))) return field;
  }
  return 'skip';
}

export function parseDelimited(text: string): ParsedSheet {
  const src = text.replace(/^\uFEFF/, '');
  if (!src.trim()) return { headers: [], rows: [] };
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = firstLine.includes('\t') && firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ',';
  const table = parseRecords(src, delim);
  const headers = (table[0] ?? []).map((h) => h.trim());
  const rows = table.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (cells[i] ?? '').trim();
    });
    return rec;
  }).filter((rec) => Object.values(rec).some((value) => value.length > 0));
  return { headers, rows };
}

/** RFC 4180: commas, quotes and newlines inside "..." stay in the same cell. */
function parseRecords(src: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '"') {
      if (quoted && src[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && ch === delim) {
      row.push(cur.trim());
      cur = '';
      continue;
    }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cur.trim());
      cur = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

export function defaultMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) mapping[h] = guessField(h);
  return mapping;
}
