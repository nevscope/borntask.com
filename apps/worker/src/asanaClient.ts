export type AsanaSheet = {
  headers: string[];
  rows: Record<string, string>[];
  extras: Map<string, AsanaStoryExtra>;
};

const TASK_FIELDS = [
  'gid',
  'name',
  'notes',
  'completed',
  'completed_at',
  'created_at',
  'modified_at',
  'due_on',
  'start_on',
  'permalink_url',
  'resource_subtype',
  'assignee.email',
  'created_by.email',
  'created_by.name',
  'parent.gid',
  'memberships.section.name',
  'tags.name',
  'followers.email',
  'custom_fields.name',
  'custom_fields.display_value',
  'custom_fields.enum_value.name',
].join(',');

const STORY_FIELDS = [
  'gid',
  'type',
  'resource_subtype',
  'text',
  'created_at',
  'created_by.name',
  'created_by.email',
].join(',');

export type AsanaStoryExtra = {
  comments: { body: string; at: string; name: string; email: string }[];
  events: { text: string; at: string }[];
};

type AsanaPage<T> = { data: T[]; next_page?: { offset: string } | null };

type AsanaCustomField = {
  name?: string | null;
  display_value?: string | null;
  enum_value?: { name?: string | null } | null;
};

type AsanaTask = {
  gid: string;
  name?: string | null;
  notes?: string | null;
  completed?: boolean;
  completed_at?: string | null;
  created_at?: string | null;
  modified_at?: string | null;
  due_on?: string | null;
  start_on?: string | null;
  permalink_url?: string | null;
  resource_subtype?: string | null;
  assignee?: { email?: string | null } | null;
  created_by?: { name?: string | null; email?: string | null } | null;
  parent?: { gid?: string | null } | null;
  memberships?: { section?: { name?: string | null } | null }[] | null;
  tags?: { name?: string | null }[] | null;
  followers?: { email?: string | null }[] | null;
  custom_fields?: AsanaCustomField[] | null;
};

type AsanaStory = {
  type?: string;
  resource_subtype?: string | null;
  text?: string | null;
  created_at?: string | null;
  created_by?: { name?: string | null; email?: string | null } | null;
};

export type AsanaFetchProgress = {
  phase: 'listing' | 'reading' | 'importing';
  listed: number;
  read: number;
};

export async function listAsanaProjectTasks(
  token: string,
  projectGid: string,
  onProgress?: (progress: AsanaFetchProgress) => Promise<void>,
): Promise<AsanaTask[]> {
  const tasks = await listAll<AsanaTask>(
    token,
    `/projects/${projectGid}/tasks?opt_fields=${TASK_FIELDS}&limit=100`,
    async (listed) => {
      await onProgress?.({ phase: 'listing', listed, read: 0 });
    },
  );
  await onProgress?.({ phase: 'listing', listed: tasks.length, read: 0 });
  const seen = new Set<string>();
  const all: AsanaTask[] = [];
  for (const task of tasks) {
    if (seen.has(task.gid)) continue;
    seen.add(task.gid);
    all.push(task);
    const children = await listAll<AsanaTask>(token, `/tasks/${task.gid}/subtasks?opt_fields=${TASK_FIELDS}&limit=100`);
    for (const child of children) {
      if (seen.has(child.gid)) continue;
      seen.add(child.gid);
      all.push(child);
    }
    if (all.length % 10 === 0) await onProgress?.({ phase: 'listing', listed: all.length, read: 0 });
  }
  await onProgress?.({ phase: 'listing', listed: all.length, read: 0 });
  return all;
}

export function asanaTaskToRow(task: AsanaTask): Record<string, string> {
  const section = task.memberships?.map((m) => m.section?.name).find((name) => name) ?? '';
  const custom = task.custom_fields ?? [];
  const priority = customValue(custom, ['priority', 'urgency']) ?? '';
  const type = customValue(custom, ['type', 'task type', 'ticket type']) ?? '';
  const extraLabels = custom
    .map((field) => (field.display_value ?? field.enum_value?.name ?? '').trim())
    .filter((value) => value && value !== '-' && value !== 'n/a');
  const tags = [
    ...(task.tags ?? []).map((tag) => tag.name ?? ''),
    ...extraLabels,
    task.resource_subtype === 'milestone' ? 'Milestone' : '',
  ].filter(Boolean);
  const notes = task.notes ?? '';
  const permalink = task.permalink_url ?? '';
  const description = permalink && !notes.includes(permalink)
    ? `${notes}${notes ? '\n\n' : ''}Asana: ${permalink}`
    : notes;
  return {
    'Task ID': task.gid,
    Name: task.name ?? '',
    Notes: description,
    'Assignee Email': task.assignee?.email ?? '',
    'Created By Email': task.created_by?.email ?? '',
    Followers: (task.followers ?? []).map((person) => person.email ?? '').filter(Boolean).join(', '),
    'Section/Column': section,
    Tags: [...new Set(tags)].join(', '),
    Priority: priority,
    Type: type,
    'Due Date': task.due_on ?? '',
    'Start Date': task.start_on ?? '',
    'Created At': task.created_at ?? '',
    'Completed At': task.completed_at ?? '',
    Completed: task.completed ? 'true' : '',
    'Last Modified': task.modified_at ?? '',
    'Parent task': task.parent?.gid ?? '',
    Permalink: permalink,
  };
}

export async function fetchAsanaSheet(
  token: string,
  projectGid: string,
  onProgress?: (progress: AsanaFetchProgress) => Promise<void>,
): Promise<AsanaSheet> {
  const all = await listAsanaProjectTasks(token, projectGid, onProgress);
  await onProgress?.({ phase: 'reading', listed: all.length, read: 0 });
  const extras = new Map<string, AsanaStoryExtra>();
  const rows: Record<string, string>[] = [];
  for (const [index, task] of all.entries()) {
    extras.set(task.gid, await loadStories(token, task.gid));
    rows.push(asanaTaskToRow(task));
    if (index === 0 || (index + 1) % 3 === 0) {
      await onProgress?.({ phase: 'reading', listed: all.length, read: index + 1 });
    }
  }
  return {
    headers: Object.keys(rows[0] ?? ASANA_HEADERS),
    rows,
    extras,
  };
}

const ASANA_HEADERS = [
  'Task ID', 'Name', 'Notes', 'Assignee Email', 'Followers', 'Section/Column', 'Tags', 'Priority', 'Type',
  'Due Date', 'Start Date', 'Created At', 'Completed At', 'Completed', 'Last Modified', 'Parent task', 'Permalink',
];

export async function loadStories(token: string, taskGid: string): Promise<AsanaStoryExtra> {
  const stories = await listAll<AsanaStory>(token, `/tasks/${taskGid}/stories?opt_fields=${STORY_FIELDS}&limit=100`);
  const comments: AsanaStoryExtra['comments'] = [];
  const events: AsanaStoryExtra['events'] = [];
  for (const story of stories) {
    const at = story.created_at ?? '';
    const text = (story.text ?? '').trim();
    if (!text) continue;
    if (story.resource_subtype === 'comment_added' || story.type === 'comment') {
      comments.push({
        body: text,
        at,
        name: story.created_by?.name ?? 'Asana',
        email: (story.created_by?.email ?? '').toLowerCase(),
      });
      continue;
    }
    if (events.length < 25) events.push({ text: text.slice(0, 180), at });
  }
  return { comments, events };
}

function customValue(fields: AsanaCustomField[], names: string[]): string | undefined {
  const want = new Set(names);
  const field = fields.find((item) => want.has((item.name ?? '').trim().toLowerCase()));
  const value = (field?.display_value ?? field?.enum_value?.name ?? '').trim();
  return value || undefined;
}

async function listAll<T>(token: string, path: string, onPage?: (count: number) => Promise<void>): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const page: AsanaPage<T> = await asanaGet(token, next);
    out.push(...(page.data ?? []));
    await onPage?.(out.length);
    const offset: string | undefined = page.next_page?.offset;
    next = offset ? `${path.split('&offset=')[0]}${path.includes('?') ? '&' : '?'}offset=${offset}` : null;
  }
  return out;
}

export async function asanaGet<T>(token: string, path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `https://app.asana.com/api/1.0${path.startsWith('/') ? path : `/${path}`}`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') ?? '15');
      await sleep(Math.min(60, Number.isFinite(wait) ? wait : 15) * 1000);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Asana returned ${res.status}${body.includes('Not Found') ? ': project not found' : ''}`);
    }
    return await res.json() as T;
  }
  throw new Error('Asana rate-limited this import. Try again in a few minutes.');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
