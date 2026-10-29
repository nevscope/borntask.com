export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

const FIELD_HINTS: Record<string, string[]> = {
  asanaTaskId: ['task id', 'asana task id', 'taskid'],
  title: ['name', 'task name', 'title'],
  description: ['notes', 'description'],
  assigneeEmail: ['assignee email'],
  reporterEmail: ['created by email', 'creator email', 'reporter email', 'created by'],
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
  parentAsanaId: ['parent task id', 'parent id', 'parent task'],
};

function foldLabel(value: string) {
  return value.normalize('NFKD').replace(/[^\w\s/-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function guessImportStatusSlug(
  name: string,
  stages: { slug: string; name: string }[],
): string | undefined {
  const lower = foldLabel(name);
  if (!lower) return undefined;
  const rules: { test: (value: string) => boolean; slug: string }[] = [
    { test: (v) => v.includes('on hold'), slug: 'on_hold' },
    { test: (v) => v.includes('reject') || v.includes('wont do') || v.includes("won't do"), slug: 'rejected' },
    { test: (v) => v.includes('deployed on live') || v === 'done' || v === 'complete' || v === 'completed' || v === 'closed' || v === 'resolved', slug: 'deployed' },
    { test: (v) => v.includes('deployed on test') || v.includes('ready for testing'), slug: 'ready_for_testing' },
    { test: (v) => v.includes('issues on test') || (v.includes('testing') && !v.includes('ready')), slug: 'testing' },
    { test: (v) => v.includes('issues on live') || v.includes('in progress') || v === 'wip', slug: 'wip' },
    { test: (v) => v.includes('approved') || v.includes('next release'), slug: 'approved' },
    { test: (v) => v.includes('idea') || v.includes('improv') || v.includes('investigation') || v.includes('billing'), slug: 'idea' },
  ];
  for (const rule of rules) {
    if (rule.test(lower) && stages.some((s) => s.slug === rule.slug)) return rule.slug;
  }
  const exact = stages.find((s) => foldLabel(s.name) === lower || s.slug === lower.replace(/\s+/g, '_'));
  if (exact) return exact.slug;
  const fuzzy = stages.find((s) => lower.includes(foldLabel(s.name)) || foldLabel(s.name).includes(lower));
  return fuzzy?.slug;
}

export function guessImportPriority(raw: string): 'urgent' | 'high' | 'medium' | 'low' | 'none' {
  const value = foldLabel(raw);
  if (!value) return 'none';
  if (value.includes('urgent') || value === 'p0' || value === 'p1') return 'urgent';
  if (value.includes('high') || value === 'p2') return 'high';
  if (value.includes('medium') || value === 'normal' || value === 'p3') return 'medium';
  if (value.includes('low') || value === 'p4' || value === 'p5') return 'low';
  return 'none';
}

export function guessImportTypeSlug(
  tags: string[],
  typeName: string,
  types: { slug: string; name: string }[],
): string | undefined {
  const labels = [typeName, ...tags].map(foldLabel).filter(Boolean);
  const pick = (slug: string) => (types.some((t) => t.slug === slug) ? slug : undefined);
  if (labels.some((v) => v === 'bug' || v.includes('bug'))) return pick('bug');
  if (labels.some((v) => v === 'feature' || v.includes('feature'))) return pick('feature');
  if (labels.some((v) => v === 'improve' || v.includes('improvement') || v === 'improv')) return pick('improvement');
  const exact = types.find((t) => labels.includes(foldLabel(t.name)) || labels.includes(t.slug));
  return exact?.slug;
}

export function emailFromMappedRow(row: Record<string, string>, columns: Record<string, string>): string {
  return mappedEmail(row, columns, 'assigneeEmail');
}

export function mappedEmail(
  row: Record<string, string>,
  columns: Record<string, string>,
  field: 'assigneeEmail' | 'reporterEmail',
): string {
  const headers = Object.entries(columns).filter(([, mapped]) => mapped === field).map(([header]) => header);
  for (const header of headers) {
    const value = (row[header] ?? '').trim().toLowerCase();
    if (value.includes('@')) return value;
  }
  return '';
}

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

export function formatImportError(raw: string): string {
  const match = raw.match(/^Row (\d+):\s*([\s\S]*)$/);
  const row = match?.[1];
  const body = match?.[2] ?? raw;
  let text = body.replace(/\s+/g, ' ').trim();
  if (/too long for the column/i.test(body) && /title/i.test(body)) {
    text = 'The task name is longer than 191 characters, so this row was skipped.';
  } else if (/too long for the column/i.test(body)) {
    const col = body.match(/Column:\s*(\w+)/i)?.[1] ?? 'value';
    text = `The ${col} value is too long for the database, so this row was skipped.`;
  } else if (/unique constraint/i.test(body) || /P2002/.test(body)) {
    text = 'This row clashes with a task that already exists, so it was skipped.';
  } else if (/P2000/.test(body)) {
    text = 'A value is too long for the database, so this row was skipped.';
  } else if (/prisma\./i.test(body)) {
    text = 'This row could not be saved, so it was skipped.';
  }
  return row ? `Row ${row}: ${text}` : text;
}

export function defaultMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) mapping[h] = guessField(h);
  return mapping;
}
