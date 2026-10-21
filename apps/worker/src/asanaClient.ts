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
  'assignee.email',
  'parent.gid',
  'memberships.section.name',
  'tags.name',
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
  assignee?: { email?: string | null } | null;
  parent?: { gid?: string | null } | null;
  memberships?: { section?: { name?: string | null } | null }[] | null;
  tags?: { name?: string | null }[] | null;
};

type AsanaStory = {
  type?: string;
  resource_subtype?: string | null;
  text?: string | null;
  created_at?: string | null;
  created_by?: { name?: string | null; email?: string | null } | null;
};

export async function fetchAsanaSheet(token: string, projectGid: string): Promise<AsanaSheet> {
  const tasks = await listAll<AsanaTask>(token, `/projects/${projectGid}/tasks?opt_fields=${TASK_FIELDS}&limit=100`);
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
  }

  const extras = new Map<string, AsanaStoryExtra>();
  const rows: Record<string, string>[] = [];
  for (const task of all) {
    extras.set(task.gid, await loadStories(token, task.gid));
    const section = task.memberships?.map((m) => m.section?.name).find((name) => name) ?? '';
    rows.push({
      'Task ID': task.gid,
      Name: task.name ?? '',
      Notes: task.notes ?? '',
      'Assignee Email': task.assignee?.email ?? '',
      'Section/Column': section,
      Tags: (task.tags ?? []).map((tag) => tag.name ?? '').filter(Boolean).join(', '),
      'Due Date': task.due_on ?? '',
      'Start Date': task.start_on ?? '',
      'Created At': task.created_at ?? '',
      'Completed At': task.completed_at ?? '',
      'Last Modified': task.modified_at ?? '',
      'Parent task': task.parent?.gid ?? '',
    });
  }

  return {
    headers: Object.keys(rows[0] ?? ASANA_HEADERS),
    rows,
    extras,
  };
}

const ASANA_HEADERS = [
  'Task ID', 'Name', 'Notes', 'Assignee Email', 'Section/Column', 'Tags',
  'Due Date', 'Start Date', 'Created At', 'Completed At', 'Last Modified', 'Parent task',
];

async function loadStories(token: string, taskGid: string): Promise<AsanaStoryExtra> {
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

async function listAll<T>(token: string, path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const page: AsanaPage<T> = await asanaGet(token, next);
    out.push(...(page.data ?? []));
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
