import { describe, expect, it } from 'vitest';
import { scheduleOnDay } from '../apps/web/src/components/GanttAddPopover';
import type { Task } from '../apps/web/src/api/types';

function task(partial: Partial<Task>): Task {
  return {
    id: 't1',
    key: 'WEB-1',
    projectKey: 'WEB',
    title: 'Example',
    description: '',
    type: 'feature',
    statusId: 'wip',
    previousStatusId: null,
    sectionId: 's1',
    assigneeId: null,
    reporterId: 'u1',
    priority: 'none',
    dueDate: null,
    startDate: null,
    labels: [],
    customFields: [],
    position: 1,
    subtaskCount: { done: 0, total: 0 },
    commentCount: 0,
    attachmentCount: 0,
    lastComment: null,
    planningParentId: null,
    planningParentKey: null,
    planningParentTitle: null,
    planningChildCount: { done: 0, total: 0 },
    isBlocked: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...partial,
  };
}

describe('scheduleOnDay', () => {
  it('places an unscheduled task on the clicked day', () => {
    expect(scheduleOnDay(task({ startDate: null, dueDate: null }), '2026-11-10')).toEqual({
      startDate: '2026-11-10',
      dueDate: '2026-11-10',
    });
  });

  it('keeps the span of a dated task', () => {
    expect(scheduleOnDay(task({ startDate: '2026-11-01', dueDate: '2026-11-04' }), '2026-11-10')).toEqual({
      startDate: '2026-11-10',
      dueDate: '2026-11-13',
    });
  });
});
