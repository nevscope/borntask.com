import { formatYmd, MCP_TOOL_NAMES, parseTimeToMinutes, parseYmd, weekStartFor, type McpToolName } from '@borntask/shared';

function apiBase(): string {
  return (process.env.API_PUBLIC_URL ?? 'http://127.0.0.1:3010').replace(/\/$/, '');
}

type ToolDef = {
  name: McpToolName;
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
    description: 'Read one task, including description, subtasks, comments, activity, links, attachment list and a url you can open in the browser.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Task key, such as WEB-142.' } },
      required: ['key'],
    },
  },
  {
    name: 'get_project',
    description: 'Read one project: members (id and name), sections, statuses and types. Use this to resolve assigneeId and sectionId for create_task.',
    inputSchema: {
      type: 'object',
      properties: { projectKey: { type: 'string', description: 'Project key, such as BOR.' } },
      required: ['projectKey'],
    },
  },
  {
    name: 'list_projects',
    description: 'List projects you can see in the workspace this token belongs to.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_project_tasks',
    description: 'List tasks in a project. Omit statusId to skip Deployed and other done stages. Pass openOnly false to include done work.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key, such as BOR.' },
        statusId: { type: 'string', description: 'Status slug, such as wip or approved.' },
        sectionId: { type: 'string' },
        openOnly: { type: 'boolean', description: 'Default true. Set false to include done tasks.' },
      },
      required: ['projectKey'],
    },
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
        attachments: {
          type: 'array',
          description: 'Optional files as name, mime and base64 data.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              mime: { type: 'string' },
              data: { type: 'string' },
            },
            required: ['name', 'data'],
          },
        },
      },
      required: ['projectKey', 'title'],
    },
  },
  {
    name: 'create_subtask',
    description: 'Add a subtask on an existing task. A subtask is a checklist item on that task, not a new task and not text in the description. You cannot delete tasks or subtasks.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Parent task key, such as WEB-142.' },
        title: { type: 'string' },
      },
      required: ['key', 'title'],
    },
  },
  {
    name: 'complete_subtask',
    description: 'Tick or untick a checklist item on a task. You cannot delete subtasks.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Parent task key, such as WEB-142.' },
        id: { type: 'string', description: 'Subtask id from get_task.' },
        done: { type: 'boolean', description: 'Default true.' },
      },
      required: ['key', 'id'],
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
    name: 'add_task_link',
    description: 'Link two tasks. Types: blocks, blocked_by, relates, duplicates. Works across projects in the same workspace. Use get_task to read existing links.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Task key, such as WEB-142.' },
        type: { type: 'string', enum: ['blocks', 'blocked_by', 'relates', 'duplicates'] },
        otherKey: { type: 'string', description: 'The other task key, such as MOB-18.' },
      },
      required: ['key', 'type', 'otherKey'],
    },
  },
  {
    name: 'remove_task_link',
    description: 'Remove a task link. Pass the link id from get_task.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Task key, such as WEB-142.' },
        id: { type: 'string', description: 'Link id from get_task.' },
      },
      required: ['key', 'id'],
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
  {
    name: 'add_attachment',
    description: 'Attach a file or screenshot to a task. Pass name, mime type and base64 content. Same size and type limits as the app (25 MB). Activity is logged via MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Task key, such as WEB-142.' },
        name: { type: 'string', description: 'File name, such as screenshot.png.' },
        mime: { type: 'string', description: 'MIME type, such as image/png.' },
        data: { type: 'string', description: 'Base64 file content.' },
      },
      required: ['key', 'name', 'data'],
    },
  },
  {
    name: 'list_timesheets',
    description: 'Read timesheet entries, days off and holidays for a date range. You always see your own sheet. Owners and admins may pass person. Project leads see only projects they lead.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD.' },
        person: { type: 'string', description: 'User id. Owners and admins may pass another person. Leads see projects they lead.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_report',
    description: 'Workspace or self reports for a date range, same scope as Reports in the app. Members see their own tasks and time. Owners and admins see the workspace. Guests and viewers cannot read reports.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD.' },
        projectId: { type: 'string', description: 'Optional project id to filter.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'log_time',
    description: 'Log time on your own day only. You cannot target another person. Uses the same parse, 24:00 cap, lock and day-off rules as the app. Pass minutes or a time string such as 2:30, 2.5 or 1,5.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Day to log, YYYY-MM-DD.' },
        projectId: { type: 'string', description: 'Project id. Use this or key.' },
        key: { type: 'string', description: 'Project key, such as WEB. Use this or projectId.' },
        minutes: { type: 'number', description: 'Minutes to log. Use this or time.' },
        time: { type: 'string', description: 'Hours as 2:30, 2.5 or 1,5. Use this or minutes.' },
        note: { type: 'string', description: 'Optional note for the cell.' },
      },
      required: ['date'],
    },
  },
];

const implemented = new Set(TOOLS.map((tool) => tool.name));
for (const name of MCP_TOOL_NAMES) {
  if (!implemented.has(name)) {
    throw new Error(`MCP tool ${name} is listed in MCP_TOOL_NAMES but missing from TOOLS.`);
  }
}

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

async function postAttachment(token: string, key: string, name: string, mime: string, data: string) {
  const buf = Buffer.from(data, 'base64');
  if (!buf.length) throw new Error('The attachment was empty.');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime || 'application/octet-stream' }), name);
  const res = await fetch(`${apiBase()}/tasks/${encodeURIComponent(key)}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-BornTask-Via': 'mcp' },
    body: form,
  });
  const textBody = await res.text();
  const json: unknown = textBody ? JSON.parse(textBody) : null;
  if (!res.ok) {
    const message = json && typeof json === 'object' && 'message' in json ? String((json as { message: unknown }).message) : res.statusText;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return json;
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
    case 'get_project': {
      const projectKey = str('projectKey') ?? '';
      const project = await api(token, 'GET', `/projects/${encodeURIComponent(projectKey)}`) as {
        project?: { key?: string; name?: string };
        members?: Array<{ userId: string }>;
        users?: Array<{ id: string; name: string }>;
        sections?: Array<{ id: string; name: string; hidden?: boolean }>;
        workflow?: { statuses?: Array<{ id: string; name: string; slug?: string }> };
      };
      const names = new Map((project.users ?? []).map((user) => [user.id, user.name]));
      return text({
        key: project.project?.key ?? projectKey,
        name: project.project?.name,
        members: (project.members ?? []).map((row) => ({
          id: row.userId,
          name: names.get(row.userId) ?? row.userId,
        })),
        sections: (project.sections ?? []).filter((row) => !row.hidden).map((row) => ({ id: row.id, name: row.name })),
        statuses: (project.workflow?.statuses ?? []).map((row) => ({ id: row.slug ?? row.id, name: row.name })),
      });
    }
    case 'list_projects':
      return text(await api(token, 'GET', '/projects'));
    case 'list_project_tasks': {
      const projectKey = str('projectKey') ?? '';
      const statusId = str('statusId');
      const sectionId = str('sectionId');
      const openOnly = args.openOnly !== false;
      const rows = await api(token, 'GET', `/projects/${encodeURIComponent(projectKey)}/tasks`) as Array<{
        key: string;
        title: string;
        statusId: string;
        statusName?: string;
        statusCategory?: string;
        sectionId: string;
        sectionName?: string;
        assigneeName?: string | null;
        type?: string;
        url?: string;
        projectKey?: string;
      }>;
      const filtered = rows.filter((row) => {
        if (statusId && row.statusId !== statusId) return false;
        if (sectionId && row.sectionId !== sectionId) return false;
        if (openOnly && row.statusCategory === 'done') return false;
        return true;
      });
      return text(filtered.map((row) => ({
        key: row.key,
        title: row.title,
        type: row.type,
        statusId: row.statusId,
        statusName: row.statusName,
        sectionName: row.sectionName,
        assigneeName: row.assigneeName ?? null,
        url: row.projectKey ? webUrl(row.projectKey, row.key) : webUrl(projectKey, row.key),
      })));
    }
    case 'list_my_tasks': {
      const mine = await api(token, 'GET', '/me/tasks') as {
        assigned?: unknown[];
        approvals?: unknown[];
      };
      return text({ assigned: mine.assigned ?? [], approvals: mine.approvals ?? [] });
    }
    case 'create_task': {
      const projectKey = str('projectKey') ?? '';
      const project = await api(token, 'GET', `/projects/${encodeURIComponent(projectKey)}`) as {
        sections?: { id: string; hidden?: boolean }[];
        disabledTypes?: string[];
      };
      const sectionId = str('sectionId') ?? project.sections?.find((s) => !s.hidden)?.id ?? project.sections?.[0]?.id;
      if (!sectionId) throw new Error('This project has no section to put the task in.');
      const disabled = new Set(project.disabledTypes ?? []);
      const defaultType = ['idea', 'bug', 'improvement', 'feature', 'task'].find((slug) => !disabled.has(slug)) ?? 'idea';
      const created = await api(token, 'POST', `/projects/${encodeURIComponent(projectKey)}/tasks`, {
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
      });
      const key = created && typeof created === 'object' && 'key' in created ? String((created as { key: string }).key) : '';
      if (key && Array.isArray(args.attachments)) {
        for (const item of args.attachments) {
          if (!item || typeof item !== 'object') continue;
          const file = item as { name?: unknown; mime?: unknown; data?: unknown };
          if (typeof file.name !== 'string' || typeof file.data !== 'string') continue;
          await postAttachment(token, key, file.name, typeof file.mime === 'string' ? file.mime : 'application/octet-stream', file.data);
        }
      }
      return withTaskUrl(created);
    }
    case 'create_subtask': {
      const key = str('key') ?? '';
      const title = (str('title') ?? '').trim();
      if (!title) throw new Error('A subtask needs a title.');
      const created = await api(token, 'POST', `/tasks/${encodeURIComponent(key)}/subtasks`, { title });
      const task = await api(token, 'GET', `/tasks/${encodeURIComponent(key)}`) as { projectKey?: string };
      return text({
        ...(created && typeof created === 'object' ? created : { created }),
        parentKey: key,
        url: task.projectKey ? webUrl(task.projectKey, key) : undefined,
      });
    }
    case 'complete_subtask': {
      const key = str('key') ?? '';
      const id = str('id') ?? '';
      const done = args.done !== false;
      return text(await api(token, 'PATCH', `/tasks/${encodeURIComponent(key)}/subtasks/${encodeURIComponent(id)}`, { done }));
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
    case 'add_task_link':
      return text(await api(token, 'POST', `/tasks/${encodeURIComponent(str('key') ?? '')}/links`, {
        type: str('type'),
        otherKey: str('otherKey'),
      }));
    case 'remove_task_link':
      return text(await api(token, 'DELETE', `/tasks/${encodeURIComponent(str('key') ?? '')}/links/${encodeURIComponent(str('id') ?? '')}`));
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
    case 'add_attachment': {
      const key = str('key') ?? '';
      const name = str('name') ?? 'attachment';
      const mime = str('mime') ?? 'application/octet-stream';
      const data = str('data') ?? '';
      if (!data) throw new Error('Pass base64 file content as data.');
      return text(await postAttachment(token, key, name, mime, data));
    }
    case 'list_timesheets': {
      const from = str('from') ?? '';
      const to = str('to') ?? '';
      const person = str('person');
      const qs = new URLSearchParams({ from, to });
      if (person) qs.set('userId', person);
      return text(await api(token, 'GET', `/timesheets?${qs}`));
    }
    case 'get_report': {
      const from = str('from') ?? '';
      const to = str('to') ?? '';
      const qs = new URLSearchParams({ from, to });
      const projectId = str('projectId');
      if (projectId) qs.set('projectId', projectId);
      return text(await api(token, 'GET', `/reports/workspace?${qs}`));
    }
    case 'log_time': {
      if (str('person') || str('userId')) {
        throw new Error('You can only log time for yourself.');
      }
      const date = str('date') ?? '';
      const minutes = resolveLogMinutes(args);
      const projectId = await resolveProjectId(token, str('projectId'), str('key') ?? str('projectKey'));
      const sheet = await api(token, 'GET', `/timesheets?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`) as {
        timesheetPeriod?: 'daily' | 'weekly';
        weekStart?: 'monday' | 'sunday';
      };
      const periodKind = sheet.timesheetPeriod === 'weekly' ? 'weekly' : 'daily';
      const periodStart = periodKind === 'weekly'
        ? formatYmd(weekStartFor(parseYmd(date), sheet.weekStart ?? 'monday'))
        : date;
      return text(await api(token, 'PUT', '/timesheets', {
        entries: [{
          projectId,
          periodKind,
          periodStart,
          unit: 'time',
          minutes,
          note: str('note') ?? null,
        }],
      }));
    }
    default:
      throw new Error(`Unknown tool ${name}.`);
  }
}

function resolveLogMinutes(args: Record<string, unknown>): number {
  if (typeof args.minutes === 'number' && Number.isFinite(args.minutes)) {
    const value = Math.round(args.minutes);
    if (value < 0 || value > 24 * 60) throw new Error('A day cannot exceed 24:00.');
    return value;
  }
  if (typeof args.minutes === 'string') {
    const parsed = parseTimeToMinutes(args.minutes);
    if (parsed == null) throw new Error('Enter time as 2:30, 2.5 or 1,5.');
    return parsed;
  }
  if (typeof args.time === 'string') {
    const parsed = parseTimeToMinutes(args.time);
    if (parsed == null) throw new Error('Enter time as 2:30, 2.5 or 1,5.');
    return parsed;
  }
  throw new Error('Pass minutes or a time string such as 2:30.');
}

async function resolveProjectId(token: string, projectId?: string, key?: string): Promise<string> {
  if (projectId && !key) return projectId;
  const rows = await api(token, 'GET', '/projects') as Array<{ id: string; key: string }>;
  if (projectId) {
    const byId = rows.find((row) => row.id === projectId);
    if (byId) return byId.id;
  }
  if (key) {
    const match = rows.find((row) => row.key.toLowerCase() === key.toLowerCase());
    if (match) return match.id;
  }
  throw new Error('Pass a projectId or project key that you can see.');
}
