import { describe, expect, test } from 'vitest';
import { FOUND_ON_FIELD, fieldAppliesToType, MAX_CUSTOM_FIELDS } from '../packages/shared/src/customFields.ts';
import type { Project, ProjectDetail, Task } from '../apps/web/src/api/types.ts';
import { customFilterField, taskMatches } from '../apps/web/src/lib/taskFilters.ts';

const project: Project = {
  id: 'p_web',
  key: 'WEB',
  name: 'Website',
  color: '#000',
  leadId: 'u1',
  workflowId: 'wf',
  openCount: 1,
  starred: false,
  counts: { backlog: 0, active: 1, review: 0, done: 0 },
};

const foundOn = { id: 'cf1', name: FOUND_ON_FIELD.name, type: 'dropdown' as const, options: ['Live', 'Test'], appliesTo: ['bug'] };

const detail: ProjectDetail = {
  project,
  sections: [{ id: 's1', projectKey: 'WEB', name: 'Home', position: 1 }],
  members: [],
  users: [],
  workflow: { id: 'wf', name: 'Delivery', statuses: [], transitions: [] },
  customFields: [foundOn],
};

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    key: 'WEB-1',
    projectKey: 'WEB',
    title: 'Bug',
    description: '',
    type: 'bug',
    statusId: 'wip',
    previousStatusId: null,
    sectionId: 's1',
    assigneeId: null,
    reporterId: 'u1',
    priority: 'none',
    dueDate: null,
    startDate: null,
    labels: [],
    customFields: [{ fieldId: 'cf1', value: 'Live' }],
    position: 1,
    subtaskCount: { done: 0, total: 0 },
    commentCount: 0,
    attachmentCount: 0,
    lastComment: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

describe('custom fields', () => {
  test('Found on applies to bugs only', () => {
    expect(fieldAppliesToType(FOUND_ON_FIELD.appliesTo, 'bug')).toBe(true);
    expect(fieldAppliesToType(FOUND_ON_FIELD.appliesTo, 'idea')).toBe(false);
    expect(MAX_CUSTOM_FIELDS).toBe(8);
  });

  test('list filter matches Found on', () => {
    const field = customFilterField('cf1');
    expect(taskMatches(task(), [{ id: 'f', field, op: 'is', values: ['Live'] }], detail, undefined)).toBe(true);
    expect(taskMatches(task(), [{ id: 'f', field, op: 'is', values: ['Test'] }], detail, undefined)).toBe(false);
    expect(taskMatches(task({ customFields: [] }), [{ id: 'f', field, op: 'empty', values: [] }], detail, undefined)).toBe(true);
  });
});
