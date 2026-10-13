// Real API client. Used when VITE_USE_MOCKS is not 'true'.
// Every response is validated with the same Zod schema the mock satisfies, so a backend that
// drifts from the contract fails loudly in development instead of rendering wrong data.
import { z } from 'zod';
import {
  ApiErrorBodySchema,
  CommentSchema,
  MeSchema,
  MyTasksSchema,
  ProjectDetailSchema,
  ProjectSchema,
  SubtaskSchema,
  TaskDetailSchema,
  TaskSchema,
  type Api,
  type ApiErrorCode,
  type ProjectRole,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly allowedRoles: ProjectRole[] | undefined;

  constructor(status: number, code: ApiErrorCode, message: string, allowedRoles?: ProjectRole[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.allowedRoles = allowedRoles;
  }
}

const BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(method: string, path: string, schema: z.ZodType<T> | null, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include', // Fastify secure session cookie
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null);
    const parsed = ApiErrorBodySchema.safeParse(json);
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.code, parsed.data.message, parsed.data.allowedRoles);
    }
    throw new ApiError(res.status, res.status === 401 ? 'UNAUTHORIZED' : 'SERVER', res.statusText);
  }

  if (schema === null || res.status === 204) return undefined as T;
  return schema.parse(await res.json());
}

const enc = encodeURIComponent;

export const httpApi: Api = {
  getMe: () => request('GET', '/me', MeSchema),
  listProjects: () => request('GET', '/projects', z.array(ProjectSchema)),
  getProject: (key) => request('GET', `/projects/${enc(key)}`, ProjectDetailSchema),
  listProjectTasks: (key) => request('GET', `/projects/${enc(key)}/tasks`, z.array(TaskSchema)),
  listMyTasks: () => request('GET', '/me/tasks', MyTasksSchema),
  getTask: (key) => request('GET', `/tasks/${enc(key)}`, TaskDetailSchema),
  createTask: (input) => request('POST', `/projects/${enc(input.projectKey)}/tasks`, TaskSchema, input),
  updateTask: (key, input) => request('PATCH', `/tasks/${enc(key)}`, TaskSchema, input),
  moveTask: (key, input) => request('POST', `/tasks/${enc(key)}/move`, TaskSchema, input),
  reorderTask: (key, input) => request('POST', `/tasks/${enc(key)}/reorder`, TaskSchema, input),
  addComment: (key, body) => request('POST', `/tasks/${enc(key)}/comments`, CommentSchema, { body }),
  addSubtask: (key, title) => request('POST', `/tasks/${enc(key)}/subtasks`, SubtaskSchema, { title }),
  setSubtaskDone: (key, id, done) => request('PATCH', `/tasks/${enc(key)}/subtasks/${enc(id)}`, SubtaskSchema, { done }),
  deleteTask: (key) => request('DELETE', `/tasks/${enc(key)}`, null),
  restoreTask: (key) => request('POST', `/tasks/${enc(key)}/restore`, TaskSchema),
};
