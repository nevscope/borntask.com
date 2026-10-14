// TanStack Query hooks. Screens only ever talk to these, never to fetch() or the mock directly,
// so flipping VITE_USE_MOCKS to false is the whole switch to the real API.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, httpApi } from './http';
import { mockApi } from './mockData';
import type { Api, CreateTaskInput, MoveTaskInput, ReorderTaskInput, Task, UpdateTaskInput } from './types';

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
  getTask: (key) => tasksApi().getTask(key),
  createTask: (input) => tasksApi().createTask(input),
  updateTask: (key, input) => tasksApi().updateTask(key, input),
  moveTask: (key, input) => tasksApi().moveTask(key, input),
  reorderTask: (key, input) => tasksApi().reorderTask(key, input),
  addComment: (key, body) => tasksApi().addComment(key, body),
  addSubtask: (key, title) => tasksApi().addSubtask(key, title),
  setSubtaskDone: (key, id, done) => tasksApi().setSubtaskDone(key, id, done),
  deleteTask: (key) => tasksApi().deleteTask(key),
  restoreTask: (key) => tasksApi().restoreTask(key),
};

export const qk = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  project: (key: string) => ['projects', key] as const,
  projectTasks: (key: string) => ['projects', key, 'tasks'] as const,
  myTasks: ['me', 'tasks'] as const,
  task: (key: string) => ['tasks', key] as const,
};

// ---------- reads ----------
export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api.getMe(), staleTime: Infinity });
export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.listProjects() });
export const useProject = (key: string) => useQuery({ queryKey: qk.project(key), queryFn: () => api.getProject(key) });
export const useProjectTasks = (key: string) => useQuery({ queryKey: qk.projectTasks(key), queryFn: () => api.listProjectTasks(key) });
export const useMyTasks = () => useQuery({ queryKey: qk.myTasks, queryFn: () => api.listMyTasks() });
export const useTask = (key: string | null) =>
  useQuery({ queryKey: qk.task(key ?? ''), queryFn: () => api.getTask(key!), enabled: !!key });

// ---------- cache helpers ----------
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
    mutationFn: ({ key, body }: { key: string; body: string }) => api.addComment(key, body),
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
    onSuccess: (task) => invalidateTaskViews(qc, task),
  });
}
