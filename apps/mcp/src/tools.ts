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
    description: 'Read one task, including description, comments, activity, attachment list and a url you can open in the browser.',
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
    description: 'Create a task. The result includes a url you can open in the browser. Ideas, improvements and features start in Idea. Bugs start where the workspace says bugs start. Stories and epics start in Idea unless the project turns that off, in which case they start in Approved. Story and epic types need work breakdown on the project. You cannot delete, change settings or invite people.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string', enum: ['idea', 'bug', 'improvement', 'feature', 'story', 'epic'] },
        description: { type: 'string' },
        sectionId: { type: 'string', description: 'Section id. Omit to use the first section.' },
        planningParentId: { type: 'string', description: 'Id of the story or epic this sits under.' },
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
        type: { type: 'string', enum: ['idea', 'bug', 'improvement', 'feature', 'story', 'epic'] },
        planningParentId: { type: ['string', 'null'], description: 'Id of the story or epic this sits under.' },
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
    name: 'move_task_to_project',
    description: 'Move a task into a different project. The task key changes to the new project prefix. Comments, files and history stay. Status is matched onto the destination workflow. You cannot delete tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Current task key, such as WEB-142.' },
        projectKey: { type: 'string', description: 'Destination project key, such as MOB.' },
        sectionId: { type: 'string', description: 'Section id. Omit to use the first section.' },
      },
      required: ['key', 'projectKey'],
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment on a task. Mention someone with @Name to notify them. Pass parentId to reply one level deep.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        body: { type: 'string' },
        parentId: { type: 'string', description: 'Comment id to reply to. Replies cannot be nested further.' },
      },
      required: ['key', 'body'],
    },
  },
  {
    name: 'get_attachment',
    description: 'Download a task attachment. Images are returned so you can see screenshots. Other files return name and size.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Task key, such as WEB-142.' },
        id: { type: 'string', description: 'Attachment id from get_task.' },
      },
      required: ['key', 'id'],
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

function webUrl(projectKey: string, taskKey: string, commentId?: string): string {
  const base = `${(process.env.PUBLIC_URL ?? 'http://localhost:5174').replace(/\/$/, '')}/p/${encodeURIComponent(projectKey)}/list?task=${encodeURIComponent(taskKey)}`;
  return commentId ? `${base}&comment=${encodeURIComponent(commentId)}` : base;
}

function withTaskUrl(value: unknown) {
  if (!value || typeof value !== 'object') return text(value);
  const row = value as { key?: string; projectKey?: string; id?: string };
  if (!row.key || !row.projectKey) return text(value);
  const url = webUrl(row.projectKey, row.key, row.id && 'body' in row ? row.id : undefined);
  return text({ ...row, url });
}

async function fetchAttachment(token: string, key: string, id: string) {
  const res = await fetch(`${apiBase()}/tasks/${encodeURIComponent(key)}/attachments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-BornTask-Via': 'mcp' },
  });
  if (!res.ok) {
    const textBody = await res.text();
    let message = res.statusText;
    try {
      const json = JSON.parse(textBody) as { message?: string };
      if (json.message) message = json.message;
    } catch {
      /* ignore */
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  const mime = res.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime, buf, name: /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? id };
}

export async function callTool(token: string, name: string, args: Record<string, unknown>) {
  const str = (key: string) => (typeof args[key] === 'string' ? args[key] : undefined);
  switch (name) {
    case 'search_tasks': {
      const query = str('query') ?? '';
      return text(await api(token, 'GET', `/search?q=${encodeURIComponent(query)}`));
    }
    case 'get_task':
      return withTaskUrl(await api(token, 'GET', `/tasks/${encodeURIComponent(str('key') ?? '')}`));
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
      return withTaskUrl(await api(token, 'POST', `/projects/${encodeURIComponent(projectKey)}/tasks`, {
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
        planningParentId: str('planningParentId') ?? null,
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
      if ('planningParentId' in args) patch.planningParentId = args.planningParentId ?? null;
      return text(await api(token, 'PATCH', `/tasks/${encodeURIComponent(key)}`, patch));
    }
    case 'move_task':
      return text(await api(token, 'POST', `/tasks/${encodeURIComponent(str('key') ?? '')}/move`, {
        toStatusId: str('toStatusId'),
        comment: str('comment'),
        overrideReason: str('overrideReason'),
      }));
    case 'move_task_to_project':
      return text(await api(token, 'POST', `/tasks/${encodeURIComponent(str('key') ?? '')}/move-project`, {
        projectKey: str('projectKey'),
        sectionId: str('sectionId'),
      }));
    case 'add_comment': {
      const key = str('key') ?? '';
      const created = await api(token, 'POST', `/tasks/${encodeURIComponent(key)}/comments`, {
        body: str('body') ?? '',
        parentId: str('parentId'),
      }) as { id?: string };
      const task = await api(token, 'GET', `/tasks/${encodeURIComponent(key)}`) as { projectKey?: string };
      const url = task.projectKey && created.id ? webUrl(task.projectKey, key, created.id) : undefined;
      return text({ ...created, url, taskUrl: task.projectKey ? webUrl(task.projectKey, key) : undefined });
    }
    case 'get_attachment': {
      const key = str('key') ?? '';
      const id = str('id') ?? '';
      const file = await fetchAttachment(token, key, id);
      if (file.mime.startsWith('image/')) {
        return {
          content: [
            { type: 'text', text: `${file.name} (${file.mime})` },
            { type: 'image', data: file.buf.toString('base64'), mimeType: file.mime },
          ],
        };
      }
      return text({ name: file.name, mime: file.mime, size: file.buf.length, note: 'Not an image. Open the task url from get_task to download it.' });
    }
    default:
      throw new Error(`Unknown tool ${name}.`);
  }
}
