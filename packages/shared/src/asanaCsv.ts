export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

const FIELD_HINTS: Record<string, string[]> = {
  asanaTaskId: ['task id', 'asana task id', 'taskid'],
  title: ['name', 'task name', 'title'],
  description: ['notes', 'description'],
  assigneeEmail: ['assignee email', 'assignee', 'email'],
  section: ['section', 'projects'],
  status: ['status'],
  dueDate: ['due date', 'due'],
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
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const first = lines[0] ?? '';
  const delim = first.includes('\t') && first.split('\t').length > first.split(',').length ? '\t' : ',';
  const headers = splitLine(first, delim);
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line, delim);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = cells[i] ?? '';
    });
    return rec;
  });
  return { headers, rows };
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function defaultMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) mapping[h] = guessField(h);
  return mapping;
}
