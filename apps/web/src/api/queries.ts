// TanStack Query hooks. Screens only ever talk to these, never to fetch() or the mock directly,
// so flipping VITE_USE_MOCKS to false is the whole switch to the real API.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, BASE_URL, httpApi, request } from './http';
import { mockApi } from './mockData';
import type { Api, CommentReactionKind, CreateTaskInput, MoveTaskInput, MoveTaskToProjectInput, NotificationList, Project, ReorderTaskInput, SearchResponse, Task, UpdateTaskInput } from './types';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
/** Stage 4: set VITE_MOCK_PROJECTS=false to use the real projects API while tasks stay mocked. */
export const USE_PROJECT_MOCKS = USE_MOCKS && import.meta.env.VITE_MOCK_PROJECTS !== 'false';
export const USE_TASK_MOCKS = USE_MOCKS && import.meta.env.VITE_MOCK_TASKS !== 'false';

const projectsApi = (): Api => (USE_PROJECT_MOCKS ? mockApi : httpApi);
const tasksApi = (): Api => (USE_TASK_MOCKS ? mockApi : httpApi);

export const api: Api = {
  getMe: async () => {
    try {
      return await httpApi.getMe();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) return mockApi.getMe();
      throw err;
    }
  },
  listProjects: async () => {
    try {
      return await projectsApi().listProjects();
    } catch (err) {
      if (USE_MOCKS && !USE_PROJECT_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
        return mockApi.listProjects();
      }
      throw err;
    }
  },
  setFavourite: (key, starred) => projectsApi().setFavourite(key, starred),
  getProject: async (key) => {
    try {
      return await projectsApi().getProject(key);
    } catch (err) {
      if (USE_MOCKS && !USE_PROJECT_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
        return mockApi.getProject(key);
      }
      throw err;
    }
  },
  listProjectTasks: async (key) => {
    try {
      return await tasksApi().listProjectTasks(key);
    } catch (err) {
      if (USE_MOCKS && !USE_TASK_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
        return mockApi.listProjectTasks(key);
      }
      throw err;
    }
  },
  search: async (q) => {
    try {
      return await tasksApi().search(q);
    } catch (err) {
      if (USE_MOCKS && !USE_TASK_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
        return mockApi.search(q);
      }
      throw err;
    }
  },
  listMyTasks: async () => {
    try {
      return await tasksApi().listMyTasks();
    } catch (err) {
      if (USE_MOCKS && !USE_TASK_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
        return mockApi.listMyTasks();
      }
      throw err;
    }
  },
  getTask: async (key) => {
    try {
      return await tasksApi().getTask(key);
    } catch (err) {
      if (USE_MOCKS && !USE_TASK_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
        return mockApi.getTask(key);
      }
      throw err;
    }
  },
  createTask: (input) => tasksApi().createTask(input),
  updateTask: (key, input) => tasksApi().updateTask(key, input),
  moveTask: (key, input) => tasksApi().moveTask(key, input),
  moveTaskToProject: (key, input) => tasksApi().moveTaskToProject(key, input),
  reorderTask: (key, input) => tasksApi().reorderTask(key, input),
  copyTask: (key) => tasksApi().copyTask(key),
  addComment: (key, body, parentId) => tasksApi().addComment(key, body, parentId),
  updateComment: (key, commentId, body) => tasksApi().updateComment(key, commentId, body),
  deleteComment: (key, commentId) => tasksApi().deleteComment(key, commentId),
  toggleCommentReaction: (key, commentId, emoji) => tasksApi().toggleCommentReaction(key, commentId, emoji),
  addSubtask: (key, title) => tasksApi().addSubtask(key, title),
  setSubtaskDone: (key, id, done) => tasksApi().setSubtaskDone(key, id, done),
  deleteTask: (key) => tasksApi().deleteTask(key),
  restoreTask: (key) => tasksApi().restoreTask(key),
  setWatching: (key, watch) => tasksApi().setWatching(key, watch),
  listNotifications: async () => {
    if (!USE_MOCKS || !USE_TASK_MOCKS) {
      try {
        return await httpApi.listNotifications();
      } catch (err) {
        if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
          return USE_TASK_MOCKS ? mockApi.listNotifications() : { items: [], unreadCount: 0 };
        }
        throw err;
      }
    }
    return mockApi.listNotifications();
  },
  markNotificationsRead: async (input) => {
    if (!USE_MOCKS || !USE_TASK_MOCKS) {
      try {
        return await httpApi.markNotificationsRead(input);
      } catch (err) {
        if (USE_MOCKS && USE_TASK_MOCKS && (err instanceof ApiError || err instanceof TypeError)) return mockApi.markNotificationsRead(input);
        throw err;
      }
    }
    return mockApi.markNotificationsRead(input);
  },
};

export const qk = {
  me: ['me'] as const,
  chatAppStatus: ['chat', 'app', 'status'] as const,
  projects: ['projects'] as const,
  project: (key: string) => ['projects', key] as const,
  projectTasks: (key: string) => ['projects', key, 'tasks'] as const,
  myTasks: ['me', 'tasks'] as const,
  search: (q: string) => ['search', q] as const,
  task: (key: string) => ['tasks', key] as const,
  notifications: ['me', 'notifications'] as const,
  people: ['people'] as const,
  workspaceSettings: ['workspace-settings'] as const,
  workspaceHolidays: (year: number) => ['workspace-holidays', year] as const,
  timesheets: (from: string, to: string, userId?: string) => ['timesheets', from, to, userId ?? 'me'] as const,
  reports: (from: string, to: string, projectId?: string) => ['reports', from, to, projectId ?? 'all'] as const,
};

// ---------- reads ----------
export const useMe = () =>
  useQuery({
    queryKey: qk.me,
    queryFn: () => api.getMe(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => (err instanceof ApiError && err.status === 401 ? false : count < 2),
  });
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.listProjects() });

export function useProjectAccessRequests(projectKey: string, enabled: boolean) {
  return useQuery({
    queryKey: ['projects', projectKey, 'access-requests'] as const,
    enabled: enabled && projectKey.length > 0,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/access-requests`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Could not load access requests.');
      return (await res.json()) as { id: string; requesterId: string; name: string; email: string; createdAt: string }[];
    },
  });
}

export function useResolveAccessRequest(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'accept' | 'decline' }) => {
      const res = await fetch(
        `${BASE_URL}/projects/${encodeURIComponent(projectKey)}/access-requests/${encodeURIComponent(id)}/${action}`,
        { method: 'POST', credentials: 'include' },
      );
      const json = await res.json().catch(() => null) as { message?: string } | null;
      if (!res.ok) throw new Error(json?.message ?? 'Could not update that request.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectKey, 'access-requests'] });
      void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
    },
  });
}

export function usePeople() {
  return useQuery({
    queryKey: qk.people,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/people`, { credentials: 'include' });
      if (!res.ok) return [] as { id: string; name: string; email: string; initials: string; workspaceRole?: string }[];
      return (await res.json()) as { id: string; name: string; email: string; initials: string; workspaceRole?: string }[];
    },
    staleTime: 60_000,
  });
}

export function useInviteToProject(projectId: string | undefined, projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; tenantRole?: 'member' | 'admin' | 'viewer'; projectRoleSlugs?: string[] }) => {
      const res = await fetch(`${BASE_URL}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: [input.email],
          tenantRole: input.tenantRole ?? 'member',
          projectId: projectId || undefined,
          projectRoleSlugs: projectId ? (input.projectRoleSlugs ?? ['developer']) : undefined,
        }),
      });
      const json = await res.json() as { message?: string; invites?: { email: string; url: string; tenantRole: string }[] };
      if (!res.ok) throw new Error(json.message ?? 'Could not send the invitation.');
      return json.invites ?? [];
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invites'] });
      void qc.invalidateQueries({ queryKey: qk.people });
      void qc.invalidateQueries({ queryKey: qk.projects });
      if (projectKey) void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
    },
  });
}

export function useAcceptProjectInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectKey: string) => {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/accept-invite`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => null) as { message?: string } | null;
      if (!res.ok) throw new Error(json?.message ?? 'Could not join this project.');
    },
    onSuccess: (_d, projectKey) => {
      void qc.invalidateQueries({ queryKey: qk.projects });
      void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.projectTasks(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.notifications });
      void qc.invalidateQueries({ queryKey: qk.myTasks });
    },
  });
}

export function useRequestProjectAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectKey: string) => {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/access-requests`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => null) as { message?: string; leadName?: string | null } | null;
      if (!res.ok) throw new Error(json?.message ?? 'Could not send the request.');
      return { leadName: json?.leadName ?? null };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}
export const useProject = (key: string) => useQuery({ queryKey: qk.project(key), queryFn: () => api.getProject(key), enabled: key.length > 0 });
export const useProjectTasks = (key: string) => useQuery({ queryKey: qk.projectTasks(key), queryFn: () => api.listProjectTasks(key), enabled: key.length > 0 });
export const useMyTasks = () => useQuery({ queryKey: qk.myTasks, queryFn: () => api.listMyTasks() });
export const useSearch = (q: string) =>
  useQuery<SearchResponse>({
    queryKey: qk.search(q),
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
  });
export const useTask = (key: string | null) =>
  useQuery({ queryKey: qk.task(key ?? ''), queryFn: () => api.getTask(key!), enabled: !!key });

export type ImportProgress = {
  id: string;
  fileName: string;
  projectKey: string;
  rowsTotal: number;
  rowsDone: number;
  status: string;
  errors?: unknown;
  phase?: string;
};

export function useImportProgress(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['import', id] as const,
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1000 : false),
    queryFn: async (): Promise<ImportProgress> => {
      const res = await fetch(`${BASE_URL}/imports/${id}`, { credentials: 'include' });
      const body = await res.json() as ImportProgress & { message?: string };
      if (!res.ok) throw new Error(body.message ?? 'Could not load import progress.');
      return body;
    },
  });
}

export const useProjectTrash = (projectKey: string) =>
  useQuery({
    queryKey: ['trash', projectKey],
    enabled: projectKey.length > 0,
    queryFn: async (): Promise<Task[]> => {
      if (USE_TASK_MOCKS) return [];
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/trash`, { credentials: 'include' });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body)) throw new Error('Could not load trash.');
      return body as Task[];
    },
  });
export const useNotifications = () =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.listNotifications(),
    staleTime: 15_000,
  });

// ---------- cache helpers ----------
export type LiveTaskEvent = {
  tenantId: string;
  projectKey: string;
  taskKey: string;
  kind: string;
  actorId?: string;
};

let notifyInvalidateAt = 0;
function invalidateNotificationsSoon(qc: QueryClient) {
  const now = Date.now();
  if (now - notifyInvalidateAt < 4000) return;
  notifyInvalidateAt = now;
  void qc.invalidateQueries({ queryKey: qk.notifications });
}

export function applyLiveTaskEvent(qc: QueryClient, event: LiveTaskEvent, opts?: { skipTask?: boolean }) {
  void qc.invalidateQueries({ queryKey: qk.projectTasks(event.projectKey) });
  void qc.invalidateQueries({ queryKey: qk.myTasks });
  invalidateNotificationsSoon(qc);
  if (!opts?.skipTask) void qc.invalidateQueries({ queryKey: qk.task(event.taskKey) });
}

function invalidateTaskViews(qc: QueryClient, task: Pick<Task, 'key' | 'projectKey'>) {
  void qc.invalidateQueries({ queryKey: qk.projectTasks(task.projectKey) });
  void qc.invalidateQueries({ queryKey: qk.myTasks });
  void qc.invalidateQueries({ queryKey: qk.task(task.key) });
  void qc.invalidateQueries({ queryKey: qk.projects });
}

/** Optimistically patch a task in its project list so drags and edits feel instant. */
function patchProjectTask(qc: QueryClient, projectKey: string, key: string, patch: Partial<Task>) {
  const queryKey = qk.projectTasks(projectKey);
  const previous = qc.getQueryData<Task[]>(queryKey);
  if (previous) qc.setQueryData<Task[]>(queryKey, previous.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  return () => qc.setQueryData(queryKey, previous);
}

const projectKeyOf = (taskKey: string) => taskKey.split('-')[0]!;

// ---------- writes ----------
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(input),
    onSuccess: (task) => invalidateTaskViews(qc, task),
  });
}

export function useCopyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.copyTask(key),
    onSuccess: (task) => invalidateTaskViews(qc, task),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: UpdateTaskInput }) => api.updateTask(key, input),
    onMutate: ({ key, input }) => ({ rollback: patchProjectTask(qc, projectKeyOf(key), key, input) }),
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: (_d, _e, { key }) => invalidateTaskViews(qc, { key, projectKey: projectKeyOf(key) }),
  });
}

export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: MoveTaskInput }) => api.moveTask(key, input),
    onMutate: ({ key, input }) => ({ rollback: patchProjectTask(qc, projectKeyOf(key), key, { statusId: input.toStatusId }) }),
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: (_d, _e, { key }) => invalidateTaskViews(qc, { key, projectKey: projectKeyOf(key) }),
  });
}

export function useMoveTaskToProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: MoveTaskToProjectInput }) => api.moveTaskToProject(key, input),
    onSuccess: (task, { key }) => {
      invalidateTaskViews(qc, { key, projectKey: projectKeyOf(key) });
      invalidateTaskViews(qc, task);
      void qc.removeQueries({ queryKey: qk.task(key) });
    },
  });
}

export function useReorderTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: ReorderTaskInput }) => api.reorderTask(key, input),
    onMutate: ({ key, input }) => ({ rollback: patchProjectTask(qc, projectKeyOf(key), key, { sectionId: input.sectionId }) }),
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: (_d, _e, { key }) => invalidateTaskViews(qc, { key, projectKey: projectKeyOf(key) }),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body, parentId }: { key: string; body: string; parentId?: string }) => api.addComment(key, body, parentId),
    onSuccess: (_c, { key }) => void qc.invalidateQueries({ queryKey: qk.task(key) }),
  });
}

export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, commentId, body }: { key: string; commentId: string; body: string }) =>
      api.updateComment(key, commentId, body),
    onSuccess: (_c, { key }) => void qc.invalidateQueries({ queryKey: qk.task(key) }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, commentId }: { key: string; commentId: string }) => api.deleteComment(key, commentId),
    onSuccess: (_d, { key }) => void qc.invalidateQueries({ queryKey: qk.task(key) }),
  });
}

export function useToggleCommentReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, commentId, emoji }: { key: string; commentId: string; emoji: CommentReactionKind }) =>
      api.toggleCommentReaction(key, commentId, emoji),
    onSuccess: (_c, { key }) => void qc.invalidateQueries({ queryKey: qk.task(key) }),
  });
}

export function useAddSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, title }: { key: string; title: string }) => api.addSubtask(key, title),
    onSuccess: (_s, { key }) => invalidateTaskViews(qc, { key, projectKey: projectKeyOf(key) }),
  });
}

export function useSetSubtaskDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, id, done }: { key: string; id: string; done: boolean }) => api.setSubtaskDone(key, id, done),
    onSuccess: (_s, { key }) => invalidateTaskViews(qc, { key, projectKey: projectKeyOf(key) }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.deleteTask(key),
    onSuccess: (_v, key) => invalidateTaskViews(qc, { key, projectKey: projectKeyOf(key) }),
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.restoreTask(key),
    onSuccess: (task) => {
      invalidateTaskViews(qc, task);
      void qc.invalidateQueries({ queryKey: ['trash', task.projectKey] });
    },
  });
}

export function useSetWatching() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, watch }: { key: string; watch: boolean }) => api.setWatching(key, watch),
    onSuccess: (_d, { key }) => void qc.invalidateQueries({ queryKey: qk.task(key) }),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; all?: boolean }) => api.markNotificationsRead(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.notifications });
      const prev = qc.getQueryData<NotificationList>(qk.notifications);
      if (prev) {
        const now = new Date().toISOString();
        const items = prev.items.map((n) => {
          if (n.readAt) return n;
          if (input.all || n.id === input.id) return { ...n, readAt: now };
          return n;
        });
        qc.setQueryData<NotificationList>(qk.notifications, {
          items,
          unreadCount: items.filter((n) => !n.readAt).length,
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.notifications, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.notifications });
    },
  });
}

export function useSetFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; starred: boolean }) => api.setFavourite(input.key, input.starred),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.projects });
      const prev = qc.getQueryData<Project[]>(qk.projects);
      qc.setQueryData<Project[]>(qk.projects, (old) => old?.map((p) => (p.key === input.key ? { ...p, starred: input.starred } : p)));
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.projects, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

const ChatEventsSchema = z.object({
  assigned: z.boolean(),
  ready_for_testing: z.boolean(),
  deployed: z.boolean(),
  mention: z.boolean(),
  status_change: z.boolean(),
  new_idea: z.boolean(),
});

const ChatSettingsSchema = z.object({
  connected: z.boolean(),
  webhookMask: z.string(),
  events: ChatEventsSchema,
  lastPostedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  appConfigured: z.boolean().optional(),
});

export type ChatSettings = z.infer<typeof ChatSettingsSchema>;
export type ChatEvents = z.infer<typeof ChatEventsSchema>;

const GithubRulesSchema = z.object({
  branchCreated: z.boolean(),
  prOpened: z.boolean(),
  draftPr: z.boolean(),
  prMerged: z.boolean(),
  prClosedUnmerged: z.boolean(),
});

const GithubSettingsSchema = z.object({
  appConfigured: z.boolean(),
  canManage: z.boolean(),
  connected: z.boolean(),
  receivingEvents: z.boolean(),
  accountLogin: z.string().nullable(),
  installedByName: z.string().nullable(),
  repoAccessCount: z.number(),
  manageUrl: z.string(),
  installPath: z.string(),
  repos: z.array(z.object({ name: z.string(), defaultBranch: z.string() })),
  availableRepos: z.array(z.object({ name: z.string(), defaultBranch: z.string() })),
  branchTemplate: z.string(),
  exampleBranch: z.string(),
  projectKey: z.string(),
  rules: GithubRulesSchema,
  events: z.array(z.object({ id: z.string(), when: z.string(), text: z.string(), result: z.string(), tone: z.string() })),
});
export type GithubSettings = z.infer<typeof GithubSettingsSchema>;
export type GithubRules = z.infer<typeof GithubRulesSchema>;

function mockGithub(projectKey: string, connected: boolean): GithubSettings {
  const rules = { branchCreated: true, prOpened: true, draftPr: false, prMerged: true, prClosedUnmerged: true };
  if (!connected) {
    return {
      appConfigured: true,
      canManage: true,
      connected: false,
      receivingEvents: false,
      accountLogin: null,
      installedByName: null,
      repoAccessCount: 0,
      manageUrl: '',
      installPath: `/github/install?project=${encodeURIComponent(projectKey)}`,
      repos: [],
      availableRepos: [],
      branchTemplate: '{type}/{key}-{title}',
      exampleBranch: `bug/${projectKey}-142-checkout-fails-on-safari-17`,
      projectKey,
      rules,
      events: [],
    };
  }
  return {
    appConfigured: true,
    canManage: true,
    connected: true,
    receivingEvents: true,
    accountLogin: '[your-github-org]',
    installedByName: 'Luke Camilleri',
    repoAccessCount: 3,
    manageUrl: 'https://github.com/apps/borntask',
    installPath: `/github/install?project=${encodeURIComponent(projectKey)}`,
    repos: [
      { name: '[your-github-org]/website', defaultBranch: 'main' },
      { name: '[your-github-org]/checkout-service', defaultBranch: 'main' },
    ],
    availableRepos: [{ name: '[your-github-org]/design-system', defaultBranch: 'main' }],
    branchTemplate: '{type}/{key}-{title}',
    exampleBranch: `bug/${projectKey}-142-checkout-fails-on-safari-17`,
    projectKey,
    rules,
    events: [
      { id: 'e1', when: new Date().toISOString(), text: 'PR 231 "Fix 3-D Secure redirect" opened by karl-f, linked to WEB-142', result: 'Comment added', tone: 'ink' },
      { id: 'e2', when: new Date().toISOString(), text: 'Branch improvement/WEB-133-lazy-load-images merged into main', result: 'Moved to Ready for testing', tone: 'brand' },
      { id: 'e3', when: new Date().toISOString(), text: 'Commit mentions WEB-999, which does not exist', result: 'Ignored', tone: 'warning' },
    ],
  };
}

const AutomationRuleSchema = z.object({
  onStatusSlug: z.string(),
  action: z.enum(['assign_role', 'notify_role']),
  roleSlug: z.string(),
  enabled: z.boolean(),
});
const AutomationsSchema = z.object({
  automations: z.array(AutomationRuleSchema),
  canManage: z.boolean(),
});
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;

const mockAutomations = {
  automations: [
    { onStatusSlug: 'ready_for_testing', action: 'assign_role' as const, roleSlug: 'tester', enabled: false },
    { onStatusSlug: 'deployed', action: 'notify_role' as const, roleSlug: 'business', enabled: false },
  ],
  canManage: true,
};

export function useProjectAutomations(projectKey: string) {
  return useQuery({
    queryKey: ['automations', projectKey],
    enabled: projectKey.length > 0,
    queryFn: async () => {
      try {
        return await request('GET', `/projects/${encodeURIComponent(projectKey)}/automations`, AutomationsSchema);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          return { ...mockAutomations, canManage: false };
        }
        if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) return mockAutomations;
        throw err;
      }
    },
  });
}

export function useSaveProjectAutomations(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (automations: AutomationRule[]) => {
      try {
        return await request('PUT', `/projects/${encodeURIComponent(projectKey)}/automations`, AutomationsSchema, { automations });
      } catch (err) {
        if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
          const next = { automations, canManage: true };
          qc.setQueryData(['automations', projectKey], next);
          return next;
        }
        throw err;
      }
    },
    onSuccess: (data) => qc.setQueryData(['automations', projectKey], data),
  });
}

export function useGithubSettings(projectKey: string) {
  return useQuery({
    queryKey: ['github', projectKey],
    enabled: projectKey.length > 0,
    queryFn: async () => {
      try {
        return await request('GET', `/projects/${encodeURIComponent(projectKey)}/github`, GithubSettingsSchema);
      } catch (err) {
        if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
          return mockGithub(projectKey, projectKey === 'WEB');
        }
        throw err;
      }
    },
  });
}

export function useSaveGithub(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { branchTemplate?: string; rules?: GithubRules; addRepo?: string; removeRepo?: string }) => {
      try {
        return await request('PUT', `/projects/${encodeURIComponent(projectKey)}/github`, GithubSettingsSchema, input);
      } catch (err) {
        if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
          const current = qc.getQueryData<GithubSettings>(['github', projectKey]) ?? mockGithub(projectKey, true);
          const repos = current.repos.filter((r) => r.name !== input.removeRepo);
          if (input.addRepo) repos.push({ name: input.addRepo, defaultBranch: 'main' });
          return {
            ...current,
            connected: true,
            repos,
            branchTemplate: input.branchTemplate ?? current.branchTemplate,
            rules: input.rules ?? current.rules,
          };
        }
        throw err;
      }
    },
    onSuccess: (data) => qc.setQueryData(['github', projectKey], data),
  });
}

const TokenRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  hint: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});

const GrantRowSchema = z.object({
  id: z.string(),
  appName: z.string(),
  redirectHost: z.string(),
  scope: z.enum(['read', 'read_write']),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});

const TokenListSchema = z.object({
  tokens: z.array(TokenRowSchema),
  grants: z.array(GrantRowSchema),
});

const MintedTokenSchema = TokenRowSchema.extend({ token: z.string() });

export type TokenRow = z.infer<typeof TokenRowSchema>;
export type GrantRow = z.infer<typeof GrantRowSchema>;
export type MintedToken = z.infer<typeof MintedTokenSchema>;

export function useChatSettings(projectKey: string) {
  return useQuery({
    queryKey: ['chat', projectKey],
    queryFn: () => request('GET', `/projects/${encodeURIComponent(projectKey)}/chat`, ChatSettingsSchema),
    enabled: projectKey.length > 0,
  });
}

export function useSaveChat(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { webhookUrl?: string; events: ChatEvents }) =>
      request('PUT', `/projects/${encodeURIComponent(projectKey)}/chat`, ChatSettingsSchema, input),
    onSuccess: (data) => qc.setQueryData(['chat', projectKey], data),
  });
}

export function useTestChat(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { webhookUrl?: string }) =>
      request('POST', `/projects/${encodeURIComponent(projectKey)}/chat/test`, z.object({ ok: z.boolean(), lastPostedAt: z.string(), lastError: z.string().nullable() }), input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['chat', projectKey] }),
  });
}

const PersonalChatPrefsSchema = z.object({
  assigned: z.boolean(),
  mention: z.boolean(),
  watch_stage: z.boolean(),
  watch_comment: z.boolean(),
  reporter_deployed: z.boolean(),
});

const MyChatSchema = z.object({
  connected: z.boolean(),
  webhookMask: z.string(),
  lastPostedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  prefs: PersonalChatPrefsSchema,
  appConfigured: z.boolean().optional(),
  dmConfigured: z.boolean().optional(),
});

export type PersonalChatPrefs = z.infer<typeof PersonalChatPrefsSchema>;
export type MyChat = z.infer<typeof MyChatSchema>;

export function useMyChat() {
  return useQuery({
    queryKey: ['me', 'chat'],
    queryFn: () => request('GET', '/me/chat', MyChatSchema),
  });
}

const ChatAppStatusSchema = z.object({
  configured: z.boolean(),
  docs: z.string().optional(),
});

export type ChatAppStatus = z.infer<typeof ChatAppStatusSchema>;

export type WorkspaceSettings = {
  name: string;
  slug: string;
  timeZone: string;
  weekStart: 'monday' | 'sunday';
  defaultWorkflowId: string | null;
  bugsStartIn: 'approved' | 'idea';
  allowGoogle: boolean;
  allowMicrosoft: boolean;
  membersCanInviteGuests: boolean;
  timesheetPeriod: 'daily' | 'weekly';
  timesheetUnit: 'time' | 'percent';
  timesheetEditDays: number;
  workingDays: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  logo?: boolean;
  workflows: { id: string; name: string; slug: string }[];
};

export type WorkspaceHoliday = { date: string; name: string };

const MOCK_WORKSPACE_SETTINGS: WorkspaceSettings = {
  name: 'Scope Cloud Solutions',
  slug: 'scope',
  timeZone: 'Europe/Malta',
  weekStart: 'monday',
  defaultWorkflowId: null,
  bugsStartIn: 'approved',
  allowGoogle: true,
  allowMicrosoft: true,
  membersCanInviteGuests: true,
  timesheetPeriod: 'weekly',
  timesheetUnit: 'time',
  timesheetEditDays: 7,
  workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  workflows: [],
};

export function applyMockWorkspaceSettings(patch: Partial<WorkspaceSettings>): WorkspaceSettings {
  Object.assign(MOCK_WORKSPACE_SETTINGS, patch);
  return { ...MOCK_WORKSPACE_SETTINGS };
}

export function useWorkspaceSettings() {
  return useQuery({
    queryKey: qk.workspaceSettings,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/workspace`, { credentials: 'include' });
      if (!res.ok) {
        if (USE_MOCKS) return { ...MOCK_WORKSPACE_SETTINGS };
        throw new Error('Sign in to load workspace settings.');
      }
      return (await res.json()) as WorkspaceSettings;
    },
  });
}

const TimesheetEntrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  periodKind: z.enum(['daily', 'weekly']),
  periodStart: z.string(),
  unit: z.enum(['time', 'percent']),
  minutes: z.number().nullable(),
  percent: z.number().nullable(),
  note: z.string().nullable(),
});

const TimesheetDayOffSchema = z.object({
  date: z.string(),
  label: z.literal('Off').optional(),
  kind: z.enum(['leave', 'other']).nullable().optional(),
  note: z.string().nullable().optional(),
});

export const TimesheetRangeSchema = z.object({
  userId: z.string(),
  timesheetPeriod: z.enum(['daily', 'weekly']).optional(),
  timesheetUnit: z.enum(['time', 'percent']).optional(),
  entries: z.array(TimesheetEntrySchema),
  daysOff: z.array(TimesheetDayOffSchema),
  holidays: z.array(z.object({ date: z.string(), name: z.string() })),
});

export type TimesheetRange = z.infer<typeof TimesheetRangeSchema>;
export type TimesheetEntryWrite = {
  projectId: string;
  periodKind: 'daily' | 'weekly';
  periodStart: string;
  unit: 'time' | 'percent';
  minutes?: number | null;
  percent?: number | null;
  note?: string | null;
  clear?: boolean;
};

const MOCK_TIMESHEETS: TimesheetRange = {
  userId: 'me',
  timesheetPeriod: 'weekly',
  timesheetUnit: 'time',
  entries: [
    { id: 'e1', projectId: 'p_web', periodKind: 'daily', periodStart: '2026-10-26', unit: 'time', minutes: 180, percent: null, note: null },
    { id: 'e2', projectId: 'p_web', periodKind: 'daily', periodStart: '2026-10-27', unit: 'time', minutes: 150, percent: null, note: 'Checkout and Safari fixes' },
    { id: 'e3', projectId: 'p_web', periodKind: 'daily', periodStart: '2026-10-28', unit: 'time', minutes: 240, percent: null, note: 'Checkout fixes with Karl, then retest on Safari 17.' },
    { id: 'e4', projectId: 'p_web', periodKind: 'daily', periodStart: '2026-10-29', unit: 'time', minutes: 90, percent: null, note: null },
    { id: 'e5', projectId: 'p_mob', periodKind: 'daily', periodStart: '2026-10-26', unit: 'time', minutes: 120, percent: null, note: null },
    { id: 'e6', projectId: 'p_mob', periodKind: 'daily', periodStart: '2026-10-27', unit: 'time', minutes: 180, percent: null, note: null },
    { id: 'e7', projectId: 'p_mob', periodKind: 'daily', periodStart: '2026-10-28', unit: 'time', minutes: 60, percent: null, note: null },
    { id: 'e8', projectId: 'p_mob', periodKind: 'daily', periodStart: '2026-10-29', unit: 'time', minutes: 150, percent: null, note: null },
    { id: 'e9', projectId: 'p_cli', periodKind: 'daily', periodStart: '2026-10-26', unit: 'time', minutes: 90, percent: null, note: null },
    { id: 'e10', projectId: 'p_cli', periodKind: 'daily', periodStart: '2026-10-27', unit: 'time', minutes: 60, percent: null, note: null },
    { id: 'e11', projectId: 'p_cli', periodKind: 'daily', periodStart: '2026-10-28', unit: 'time', minutes: 120, percent: null, note: null },
    { id: 'e12', projectId: 'p_cli', periodKind: 'daily', periodStart: '2026-10-29', unit: 'time', minutes: 180, percent: null, note: 'Welcome emails' },
  ],
  daysOff: [{ date: '2026-10-30', kind: 'leave', note: null, label: 'Off' }],
  holidays: [],
};

async function fetchTimesheets(from: string, to: string, userId?: string): Promise<TimesheetRange> {
  const qs = new URLSearchParams({ from, to });
  if (userId) qs.set('userId', userId);
  try {
    return await request('GET', `/timesheets?${qs}`, TimesheetRangeSchema);
  } catch (err) {
    if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
      return { ...MOCK_TIMESHEETS, userId: userId ?? MOCK_TIMESHEETS.userId };
    }
    throw err;
  }
}

export function useTimesheets(from: string, to: string, userId?: string, enabled = true) {
  return useQuery({
    queryKey: qk.timesheets(from, to, userId),
    enabled: enabled && Boolean(from && to),
    queryFn: () => fetchTimesheets(from, to, userId),
  });
}

export function useSaveTimesheets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: TimesheetEntryWrite[]) => {
      const res = await fetch(`${BASE_URL}/timesheets`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const json = await res.json().catch(() => ({})) as { message?: string; saved?: number };
      if (!res.ok) {
        if (USE_MOCKS) return { saved: entries.length };
        throw new ApiError(res.status, 'VALIDATION', json.message ?? 'Could not save the timesheet.');
      }
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['timesheets'] }),
  });
}

export function useSaveDaysOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      days?: Array<{ date: string; kind?: 'leave' | 'other'; note?: string | null; clear?: boolean }>;
      week?: { weekStart: string; count: number; kind: 'leave' | 'other'; note?: string | null };
    }) => {
      const res = await fetch(`${BASE_URL}/timesheets/days-off`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) {
        if (USE_MOCKS) return { ok: true };
        throw new ApiError(res.status, 'VALIDATION', json.message ?? 'Could not update days off.');
      }
      return json;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['timesheets'] }),
  });
}

export type WorkspaceReports = {
  scope: 'self' | 'workspace';
  range: { from: string; to: string };
  timeZone: string;
  holidays: { date: string; name: string }[];
  workingDaysSoFar: number;
  tasks: {
    opened: number;
    closed: number;
    closedHint: string;
    open: number;
    openHint: string;
    overdue: number;
    unscheduled: number | null;
    closeDays: string;
    closeHint: string;
    startDays: string;
    startHint: string;
    byProject: Array<{
      projectId: string;
      key?: string;
      name: string;
      colour: string;
      opened: number;
      closed: number;
      open: number;
      flight: number;
      overdue: number;
      close: string;
      start: string;
    }>;
    byPerson: Array<{
      userId: string | null;
      name: string;
      initials: string;
      open: number;
      closed: number;
      overdue: number;
      close: string;
    }>;
    upcoming: Array<{
      key: string;
      title: string;
      who: string;
      status: string;
      due: string;
      dueTone: 'today' | 'normal';
    }>;
  };
  timesheets: {
    time: string;
    minutes: number;
    weight: number;
    peopleWithTime: number;
    peopleTotal: number;
    complete: number;
    missingDays: number;
    missingPeople: number;
    daysOff: number;
    daysOffPeople: number;
    completeLabel: string;
    projects: Array<{ id: string; name: string; colour: string }>;
    people: Array<{
      userId: string;
      name: string;
      initials: string;
      byProject: Record<string, string>;
      byProjectMinutes: Record<string, number>;
      byProjectWeight: Record<string, number>;
      total: string;
      minutes: number;
      weight: number;
      off: number;
      loggedDays: number;
      expected: number;
    }>;
    byProject: Array<{
      projectId: string;
      name: string;
      colour: string;
      time: string;
      minutes: number;
      weight: number;
      people: number;
      share: string;
    }>;
    projectTotals: { total: string; off: number } & Record<string, string | number>;
    missing: Array<{
      userId: string;
      name: string;
      initials: string;
      detail: string;
      count: string;
      tone: 'danger' | 'warning';
    }>;
  };
};

function daysLabel(n: number | null | undefined): string {
  if (n == null) return '-';
  return `${n} days`;
}

function personInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function mapLiveReports(raw: {
  scope?: 'self' | 'workspace';
  range?: { from: string; to: string };
  holidays?: { date: string; name: string }[];
  tasks?: {
    opened: number;
    closed: number;
    closedHint?: string;
    open: number;
    openHint?: string;
    overdue: number;
    unscheduled?: number | null;
    inFlight?: number;
    closeDays?: string;
    closeHint?: string;
    startDays?: string;
    startHint?: string;
    avgCloseDays?: number | null;
    avgStartDays?: number | null;
    byProject?: Array<{
      projectId: string;
      key?: string;
      name: string;
      colour: string;
      opened: number;
      closed: number;
      open: number;
      flight: number;
      overdue: number;
      close?: string;
      start?: string;
    }>;
    byPerson?: WorkspaceReports['tasks']['byPerson'];
    upcoming?: WorkspaceReports['tasks']['upcoming'];
  };
  timesheets?: {
    time: string;
    minutes?: number;
    weight?: number;
    peopleWithTime: number;
    peopleTotal?: number;
    complete: number;
    missingDays: number;
    daysOff: number;
    people?: Array<{
      userId: string;
      name: string;
      time: string;
      minutes?: number;
      weight?: number;
      off: number;
      loggedDays: number;
      expected: number;
      missing: number;
      complete: boolean;
      byProject: Record<string, string>;
      byProjectMinutes?: Record<string, number>;
      byProjectWeight?: Record<string, number>;
    }>;
    byProject?: Array<{
      projectId: string;
      name: string;
      colour: string;
      time: string;
      minutes?: number;
      weight?: number;
      people: number;
      share: string;
    }>;
    missing?: Array<{ userId: string; name: string; missing: number; off: number; detail?: string }>;
  };
  timeZone?: string;
  workingDaysSoFar?: number;
}, from: string, to: string, timeZone: string): WorkspaceReports {
  const people = raw.timesheets?.people ?? [];
  const complete = people.filter((p) => p.complete).length;
  const partial = people.filter((p) => !p.complete && p.loggedDays > 0).length;
  const none = people.filter((p) => p.loggedDays === 0).length;
  const missingPeople = people.filter((p) => p.missing > 0).length;
  const daysOffPeople = people.filter((p) => p.off > 0).length;
  const projects = (raw.timesheets?.byProject ?? []).map((p) => ({ id: p.projectId, name: p.name, colour: p.colour }));
  const totals: WorkspaceReports['timesheets']['projectTotals'] = {
    total: raw.timesheets?.time ?? '0:00',
    off: raw.timesheets?.daysOff ?? 0,
  };
  for (const row of raw.timesheets?.byProject ?? []) totals[row.projectId] = row.time;
  const minutesTotal = raw.timesheets?.minutes ?? 0;
  const weightTotal = raw.timesheets?.weight ?? minutesTotal;

  return {
    scope: raw.scope === 'self' ? 'self' : 'workspace',
    range: raw.range ?? { from, to },
    timeZone: raw.timeZone ?? timeZone,
    holidays: raw.holidays ?? [],
    workingDaysSoFar: raw.workingDaysSoFar ?? 0,
    tasks: {
      opened: raw.tasks?.opened ?? 0,
      closed: raw.tasks?.closed ?? 0,
      closedHint: raw.tasks?.closedHint ?? '',
      open: raw.tasks?.open ?? 0,
      openHint: raw.tasks?.openHint ?? (raw.tasks?.inFlight != null ? `${raw.tasks.inFlight} in flight` : ''),
      overdue: raw.tasks?.overdue ?? 0,
      unscheduled: raw.tasks?.unscheduled ?? null,
      closeDays: raw.tasks?.closeDays ?? daysLabel(raw.tasks?.avgCloseDays),
      closeHint: raw.tasks?.closeHint ?? (raw.tasks?.avgCloseDays != null ? 'average' : ''),
      startDays: raw.tasks?.startDays ?? daysLabel(raw.tasks?.avgStartDays),
      startHint: raw.tasks?.startHint ?? (raw.tasks?.avgStartDays != null ? 'average · to first move into WIP or review' : ''),
      byProject: (raw.tasks?.byProject ?? []).map((row) => ({
        ...row,
        close: row.close ?? '-',
        start: row.start ?? '-',
      })),
      byPerson: raw.tasks?.byPerson ?? [],
      upcoming: raw.tasks?.upcoming ?? [],
    },
    timesheets: {
      time: raw.timesheets?.time ?? '0:00',
      minutes: minutesTotal,
      weight: weightTotal,
      peopleWithTime: raw.timesheets?.peopleWithTime ?? 0,
      peopleTotal: raw.timesheets?.peopleTotal ?? people.length,
      complete: raw.timesheets?.complete ?? complete,
      missingDays: raw.timesheets?.missingDays ?? 0,
      missingPeople,
      daysOff: raw.timesheets?.daysOff ?? 0,
      daysOffPeople,
      completeLabel: `${complete} complete · ${partial} partial · ${none} none`,
      projects,
      people: people.map((p) => ({
        userId: p.userId,
        name: p.name,
        initials: personInitials(p.name),
        byProject: p.byProject,
        byProjectMinutes: p.byProjectMinutes ?? {},
        byProjectWeight: p.byProjectWeight ?? {},
        total: p.time,
        minutes: p.minutes ?? 0,
        weight: p.weight ?? p.minutes ?? 0,
        off: p.off,
        loggedDays: p.loggedDays,
        expected: p.expected,
      })),
      byProject: (raw.timesheets?.byProject ?? []).map((p) => ({
        ...p,
        minutes: p.minutes ?? 0,
        weight: p.weight ?? p.minutes ?? 0,
      })),
      projectTotals: totals,
      missing: (raw.timesheets?.missing ?? []).map((m) => ({
        userId: m.userId,
        name: m.name,
        initials: personInitials(m.name),
        detail: m.detail
          ?? (m.off
            ? `Expected days with no time · ${m.off} days off`
            : m.missing === 0
              ? 'No time and no days off this period'
              : 'Expected working days with no time and no day off'),
        count: m.missing === 1 ? '1 day' : `${m.missing} days`,
        tone: m.missing >= 10 ? 'danger' : 'warning',
      })),
    },
  };
}

export function useWorkspaceReports(
  from: string,
  to: string,
  projectId: string | undefined,
  enabled: boolean,
  timeZone = 'UTC',
) {
  return useQuery({
    queryKey: qk.reports(from, to, projectId),
    enabled: enabled && Boolean(from && to),
    queryFn: async (): Promise<WorkspaceReports> => {
      const qs = new URLSearchParams({ from, to });
      if (projectId) qs.set('projectId', projectId);
      try {
        const res = await fetch(`${BASE_URL}/reports/workspace?${qs}`, { credentials: 'include' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (USE_MOCKS) {
            const { mockWorkspaceReports } = await import('./reportsMock');
            return mockWorkspaceReports();
          }
          throw new ApiError(res.status, 'FORBIDDEN', (json as { message?: string }).message ?? 'You cannot view reports.');
        }
        return mapLiveReports(json, from, to, timeZone);
      } catch (err) {
        if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
          const { mockWorkspaceReports } = await import('./reportsMock');
          return mockWorkspaceReports();
        }
        throw err;
      }
    },
  });
}

export function useWorkspaceHolidays(year: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.workspaceHolidays(year),
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/workspace/holidays?year=${year}`, { credentials: 'include' });
      const json = await res.json().catch(() => ({})) as { holidays?: WorkspaceHoliday[]; message?: string };
      if (!res.ok) throw new Error(json.message ?? 'Could not load public holidays.');
      return { year, holidays: json.holidays ?? [] };
    },
  });
}

export function useChatAppStatus() {
  return useQuery({
    queryKey: qk.chatAppStatus,
    queryFn: async () => {
      try {
        return await request('GET', '/chat/app/status', ChatAppStatusSchema);
      } catch (err) {
        if (USE_MOCKS && (err instanceof ApiError || err instanceof TypeError)) {
          return { configured: true };
        }
        throw err;
      }
    },
  });
}

export function useSaveMyChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { webhookUrl?: string; prefs?: PersonalChatPrefs }) =>
      request('PUT', '/me/chat', MyChatSchema, input),
    onSuccess: (data) => qc.setQueryData(['me', 'chat'], data),
  });
}

export function useTestMyChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { webhookUrl?: string }) =>
      request('POST', '/me/chat/test', z.object({ ok: z.boolean(), lastPostedAt: z.string(), lastError: z.string().nullable() }), input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me', 'chat'] }),
  });
}

export function useDisconnectMyChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request('DELETE', '/me/chat', MyChatSchema),
    onSuccess: (data) => qc.setQueryData(['me', 'chat'], data),
  });
}

export function useDisconnectChat(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request('DELETE', `/projects/${encodeURIComponent(projectKey)}/chat`, ChatSettingsSchema),
    onSuccess: (data) => qc.setQueryData(['chat', projectKey], data),
  });
}

export function useApiTokens() {
  return useQuery({
    queryKey: ['tokens'],
    queryFn: () => request('GET', '/me/tokens', TokenListSchema),
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scope: 'read' | 'read_write' }) => request('POST', '/me/tokens', MintedTokenSchema, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tokens'] }),
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request('DELETE', `/me/tokens/${encodeURIComponent(id)}`, z.object({ ok: z.boolean() })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tokens'] }),
  });
}

export function useRevokeGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request('DELETE', `/me/grants/${encodeURIComponent(id)}`, z.object({ ok: z.boolean() })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tokens'] }),
  });
}
