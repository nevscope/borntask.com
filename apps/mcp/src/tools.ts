function apiBase(): string {
  return (process.env.API_PUBLIC_URL ?? 'http://127.0.0.1:3010').replace(/\/$/, '');
}

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const TOOLS: ToolDef[] = [
  {
    name: 'search_tasks',
    description: 'Search tasks you can see by title, description, comment or key.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Words or a task key such as WEB-142.' } },
      required: ['query'],
    },
  },
  {
    name: 'get_task',
    description: 'Read one task, including description, comments and activity.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Task key, such as WEB-142.' } },
      required: ['key'],
    },
  },
  {
    name: 'list_projects',
    description: 'List projects you can see in the workspace this token belongs to.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_my_tasks',
    description: 'List tasks assigned to you.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description: 'Create a task. Ideas, improvements and features start in Idea. Bugs start where the workspace says bugs start. You cannot delete, change settings or invite people.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string', enum: ['idea', 'bug', 'improvement', 'feature'] },
        description: { type: 'string' },
        sectionId: { type: 'string', description: 'Section id. Omit to use the first section.' },
        assigneeId: { type: 'string' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'] },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['projectKey', 'title'],
    },
  },
  {
    name: 'update_task',
    description: 'Change title, description, type, assignee, priority or due date. Status changes must use move_task. You cannot delete tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        type: { type: 'string', enum: ['idea', 'bug', 'improvement', 'feature'] },
        assigneeId: { type: ['string', 'null'] },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'] },
        dueDate: { type: ['string', 'null'] },
      },
      required: ['key'],
    },
  },
  {
    name: 'move_task',
    description: 'Move a task to another status. Uses the same workflow rules as the signed-in person, including required comments and role checks. toStatusId is the status slug, such as wip, ready_for_testing or deployed.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        toStatusId: { type: 'string' },
        comment: { type: 'string', description: 'Required for Reject and Fail.' },
        overrideReason: { type: 'string', description: 'Only an owner, admin or project lead can override a blocked move.' },
      },
      required: ['key', 'toStatusId'],
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment on a task. Mention someone with @Name to notify them.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['key', 'body'],
    },
  },
];

async function api(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-BornTask-Via': 'mcp',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = json && typeof json === 'object' && 'message' in json ? String((json as { message: unknown }).message) : res.statusText;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return json;
}

function text(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export async function callTool(token: string, name: string, args: Record<string, unknown>) {
  const str = (key: string) => (typeof args[key] === 'string' ? args[key] : undefined);
  switch (name) {
    case 'search_tasks': {
      const query = str('query') ?? '';
      return text(await api(token, 'GET', `/search?q=${encodeURIComponent(query)}`));
    }
    case 'get_task':
      return text(await api(token, 'GET', `/tasks/${encodeURIComponent(str('key') ?? '')}`));
    case 'list_projects':
      return text(await api(token, 'GET', '/projects'));
    case 'list_my_tasks':
      return text(await api(token, 'GET', '/me/tasks'));
    case 'create_task': {
      const projectKey = str('projectKey') ?? '';
      const project = await api(token, 'GET', `/projects/${encodeURIComponent(projectKey)}`) as {
        sections?: { id: string }[];
        disabledTypes?: string[];
      };
      const sectionId = str('sectionId') ?? project.sections?.[0]?.id;
      if (!sectionId) throw new Error('This project has no section to put the task in.');
      const disabled = new Set(project.disabledTypes ?? []);
      const defaultType = ['idea', 'bug', 'improvement', 'feature', 'task'].find((slug) => !disabled.has(slug)) ?? 'idea';
      return text(await api(token, 'POST', `/projects/${encodeURIComponent(projectKey)}/tasks`, {
        projectKey,
        sectionId,
        type: str('type') ?? defaultType,
        title: str('title') ?? '',
        description: str('description') ?? '',
        assigneeId: str('assigneeId') ?? null,
        priority: str('priority') ?? 'none',
        dueDate: str('dueDate') ?? null,
        labels: [],
        attachmentIds: [],
      }));
    }
    case 'update_task': {
      const key = str('key') ?? '';
      const patch: Record<string, unknown> = {};
      for (const field of ['title', 'description', 'type', 'priority'] as const) {
        if (str(field) !== undefined) patch[field] = str(field);
      }
      if ('assigneeId' in args) patch.assigneeId = args.assigneeId ?? null;
      if ('dueDate' in args) patch.dueDate = args.dueDate ?? null;
      return text(await api(token, 'PATCH', `/tasks/${encodeURIComponent(key)}`, patch));
    }
    case 'move_task':
      return text(await api(token, 'POST', `/tasks/${encodeURIComponent(str('key') ?? '')}/move`, {
        toStatusId: str('toStatusId'),
        comment: str('comment'),
        overrideReason: str('overrideReason'),
      }));
    case 'add_comment':
      return text(await api(token, 'POST', `/tasks/${encodeURIComponent(str('key') ?? '')}/comments`, { body: str('body') ?? '' }));
    default:
      throw new Error(`Unknown tool ${name}.`);
  }
}
