import { describe, expect, test } from 'vitest';
import type { Project, ProjectDetail, Task, WorkspaceTasks } from '../apps/web/src/api/types.ts';
import {
  filtersBeyondPreset,
  groupWorkspaceTasks,
  PRESET_VIEWS,
  taskMatches,
  WORKSPACE_PRESET_VIEWS,
  workspaceFilterDetail,
} from '../apps/web/src/lib/taskFilters.ts';

const project: Project = {
  id: 'p_web',
  key: 'WEB',
  name: 'Website',
  color: '#000',
  leadId: 'u1',
  workflowId: 'wf',
  openCount: 1,
  starred: false,
  counts: { backlog: 0, active: 0, review: 1, done: 0 },
};

const detail: ProjectDetail = {
  project,
  sections: [{ id: 's1', projectKey: 'WEB', name: 'Home', position: 1 }],
  members: [{ userId: 'u1', roles: ['developer'] }],
  users: [{ id: 'u1', name: 'Alex', email: 'a@example.com', initials: 'A' }],
  workflow: {
    id: 'wf',
    name: 'Delivery',
    statuses: [
      { id: 'testing', name: 'Testing', category: 'review', tone: 'orange', position: 1, wipLimit: null, side: false },
      { id: 'wip', name: 'WIP', category: 'active', tone: 'blue', position: 2, wipLimit: null, side: false },
    ],
    transitions: [],
  },
};

function task(over: Partial<Task>): Task {
  return {
    id: 't1',
    key: 'WEB-1',
    projectKey: 'WEB',
    title: 'Checkout',
    description: '',
    type: 'bug',
    statusId: 'testing',
    previousStatusId: null,
    sectionId: 's1',
    assigneeId: 'u1',
    reporterId: 'u1',
    priority: 'medium',
    dueDate: null,
    startDate: null,
    labels: [],
    customFields: [],
    position: 1,
    subtaskCount: { done: 0, total: 0 },
    commentCount: 0,
    attachmentCount: 0,
    lastComment: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    statusName: 'Testing',
    statusCategory: 'review',
    ...over,
  };
}

describe('workspace views', () => {
  test('My work keeps assigned open tasks', () => {
    const mine = WORKSPACE_PRESET_VIEWS.find((row) => row.id === 'ws-mine')!;
    expect(taskMatches(task({}), mine.filters, detail, 'u1')).toBe(true);
    expect(taskMatches(task({ assigneeId: 'u2' }), mine.filters, detail, 'u1')).toBe(false);
    expect(taskMatches(task({ statusCategory: 'done', statusId: 'deployed' }), mine.filters, detail, 'u1')).toBe(false);
  });

  test('Open bugs is type bug and not done', () => {
    const bugs = WORKSPACE_PRESET_VIEWS.find((row) => row.id === 'ws-bugs')!;
    expect(taskMatches(task({ type: 'bug' }), bugs.filters, detail, 'u1')).toBe(true);
    expect(taskMatches(task({ type: 'feature' }), bugs.filters, detail, 'u1')).toBe(false);
  });

  test('Waiting for testing matches review by name or category', () => {
    const waiting = WORKSPACE_PRESET_VIEWS.find((row) => row.id === 'ws-testing')!;
    expect(taskMatches(task({ statusId: 'ready', statusName: 'Ready for testing', statusCategory: 'review' }), waiting.filters, detail, 'u1')).toBe(true);
    expect(taskMatches(task({ statusId: 'wip', statusName: 'WIP', statusCategory: 'active' }), waiting.filters, detail, 'u1')).toBe(false);
    expect(taskMatches(task({ statusId: 'testing' }), waiting.filters, detail, 'u1')).toBe(true);
  });

  test('status filter matches slug or name', () => {
    expect(taskMatches(task({}), [{ id: 's', field: 'status', op: 'is', values: ['Testing'] }], detail, 'u1')).toBe(true);
    expect(taskMatches(task({}), [{ id: 's', field: 'status', op: 'is', values: ['testing'] }], detail, 'u1')).toBe(true);
  });

  test('groups by project then status', () => {
    const tasks = [
      task({ id: 'a', key: 'WEB-1', projectKey: 'WEB', statusId: 'testing' }),
      task({ id: 'b', key: 'MOB-1', projectKey: 'MOB', statusId: 'wip', statusName: 'WIP', statusCategory: 'active' }),
    ];
    const projects = [project, { ...project, id: 'p_mob', key: 'MOB', name: 'Mobile' }];
    const byProject = groupWorkspaceTasks(tasks, 'project', projects, detail.users);
    expect(byProject.map((row) => row.name)).toEqual(['Website', 'Mobile']);
    const byStatus = groupWorkspaceTasks(tasks, 'status', projects, detail.users);
    expect(byStatus.map((row) => row.name)).toEqual(['Testing', 'WIP']);
  });

  test('workspace filter detail unions statuses', () => {
    const data: WorkspaceTasks = {
      tasks: [task({})],
      users: detail.users,
      statuses: [{ id: 'testing', name: 'Testing', category: 'review' }],
      sections: [{ id: 's1', name: 'Home' }],
      labels: [],
    };
    expect(workspaceFilterDetail(data, [project]).workflow.statuses[0]?.name).toBe('Testing');
  });

  test('Open preset does not surface Status category chips', () => {
    const open = PRESET_VIEWS.find((row) => row.id === 'preset-open')!;
    expect(filtersBeyondPreset(open.filters, 'preset-open', PRESET_VIEWS)).toEqual([]);
    const extra = { id: 'mine', field: 'assignee' as const, op: 'is' as const, values: ['me'] };
    expect(filtersBeyondPreset([...open.filters, extra], 'preset-open', PRESET_VIEWS)).toEqual([extra]);
    expect(filtersBeyondPreset(open.filters, 'saved-closed', PRESET_VIEWS)).toEqual([]);
    expect(filtersBeyondPreset(open.filters, null, PRESET_VIEWS)).toEqual([]);
  });
});
