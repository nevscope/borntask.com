import { describe, expect, test, vi } from 'vitest';
import { ApiError } from '../apps/api/src/errors.ts';
import {
  buildMovedUnderComment,
  CONVERT_CONFIRM_MESSAGE,
  convertLoss,
  convertNeedsConfirm,
  convertTaskToSubtask,
  promoteSubtask,
} from '../apps/api/src/lib/convertTaskNesting.ts';
import type { Authed } from '../apps/api/src/context.ts';

vi.mock('../apps/api/src/lib/projectAccess.ts', () => ({
  requireOpenProjectWrite: async () => ({}),
}));

vi.mock('../apps/api/src/lib/live.ts', () => ({
  publishTaskChange: () => {},
}));

const posted: string[] = [];
vi.mock('../apps/api/src/lib/postComment.ts', () => ({
  postComment: async (_auth: unknown, _parent: unknown, body: string) => {
    posted.push(body);
    return { id: 'c-new' };
  },
}));

function taskRow(over: Record<string, unknown> = {}) {
  return {
    id: 'child-1',
    tenantId: 't1',
    projectId: 'p1',
    number: 50,
    title: 'Write invoice notes',
    description: '<p>Draft the notes</p>',
    typeId: 'type-1',
    statusId: 'st-1',
    previousStatusId: null,
    sectionId: 'sec-1',
    assigneeId: 'u-ann',
    reporterId: 'u-1',
    priority: 'none',
    dueDate: new Date('2026-11-20T00:00:00.000Z'),
    startDate: null,
    estimate: null,
    position: 'a0',
    parentId: null,
    planningParentId: null,
    completedAt: null,
    deletedAt: null,
    deletedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    type: { slug: 'improvement', name: 'Improvement' },
    status: { slug: 'idea', name: 'Idea' },
    previousStatus: null,
    section: { id: 'sec-1' },
    project: { id: 'p1', key: 'WEB', name: 'Website' },
    labels: [],
    attachments: [],
    comments: [],
    _count: { comments: 0, attachments: 0 },
    ...over,
  };
}

function makeDb(state: {
  child: ReturnType<typeof taskRow>;
  parent: ReturnType<typeof taskRow>;
  comments?: { body: string; author: { name: string } }[];
  attachments?: { name: string }[];
  activity?: { action: string }[];
  nested?: number;
}) {
  const child = state.child;
  const parent = state.parent;
  const comments = state.comments ?? [];
  const attachments = state.attachments ?? [];
  const activity = state.activity ?? [{ action: 'created this improvement' }];
  const updates: Record<string, unknown>[] = [];
  const logs: Record<string, unknown>[] = [];

  const db = {
    project: {
      findFirst: async ({ where }: { where: { key: string } }) => {
        if (where.key === child.project.key || where.key === parent.project.key) {
          return { id: 'p1', key: where.key, name: 'Website' };
        }
        return null;
      },
    },
    task: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.number === child.number && !child.deletedAt) return child;
        if (where.number === parent.number && !parent.deletedAt) return parent;
        if (where.id === child.id && where.parentId === parent.id) return child;
        if (where.sectionId && where.parentId === null) return { position: 'a9' };
        return null;
      },
      count: async () => state.nested ?? 0,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, ...data });
        if (where.id === child.id) Object.assign(child, data);
        if (where.id === parent.id) Object.assign(parent, data);
        return child;
      },
    },
    comment: {
      findMany: async () => comments,
    },
    attachment: {
      findMany: async () => attachments,
    },
    activityLog: {
      findMany: async () => activity,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        logs.push(data);
        return data;
      },
    },
  };

  return { db, updates, logs, child, parent };
}

function authWith(db: unknown): Authed {
  return {
    userId: 'u-1',
    tenantId: 't1',
    workspaceRole: 'owner',
    db,
    via: 'app',
    actorType: 'user',
    tokenScope: 'session',
  } as unknown as Authed;
}

describe('convert loss warning', () => {
  test('does not warn for a new task with only the created event', () => {
    const loss = convertLoss({
      comments: [],
      attachments: [],
      activity: [{ action: 'created this improvement' }],
    });
    expect(loss).toEqual({ comments: 0, attachments: 0, history: 0 });
    expect(convertNeedsConfirm(loss)).toBe(false);
  });

  test('warns when comments, attachments or later history exist', () => {
    expect(convertNeedsConfirm(convertLoss({
      comments: [{}],
      attachments: [],
      activity: [{ action: 'created this bug' }],
    }))).toBe(true);
    expect(convertNeedsConfirm(convertLoss({
      comments: [],
      attachments: [{}],
      activity: [{ action: 'created this bug' }],
    }))).toBe(true);
    expect(convertNeedsConfirm(convertLoss({
      comments: [],
      attachments: [],
      activity: [{ action: 'created this bug' }, { action: 'moved to WIP' }],
    }))).toBe(true);
  });
});

describe('moved-under parent comment', () => {
  test('copies title, comments, attachments and history', () => {
    const html = buildMovedUnderComment({
      childKey: 'WEB-50',
      title: 'Write invoice notes',
      description: '<p>Draft the notes</p>',
      comments: [{ authorName: 'Hannah', body: '<p>Please check VAT</p>' }],
      attachments: [{ name: 'scan.pdf' }],
      activity: [{ action: 'created this improvement' }, { action: 'moved to WIP' }],
    });
    expect(html).toContain('WEB-50');
    expect(html).toContain('Write invoice notes');
    expect(html).toContain('Draft the notes');
    expect(html).toContain('Hannah: Please check VAT');
    expect(html).toContain('scan.pdf');
    expect(html).toContain('moved to WIP');
    expect(html).not.toContain('created this improvement');
  });
});

describe('convert task to subtask', () => {
  test('refuses without confirm when the task has comments', async () => {
    posted.length = 0;
    const { db } = makeDb({
      child: taskRow({ number: 50 }),
      parent: taskRow({ id: 'parent-1', number: 10, title: 'Month close' }),
      comments: [{ body: '<p>Keep this</p>', author: { name: 'Hannah' } }],
    });
    try {
      await convertTaskToSubtask(authWith(db), 'WEB-50', { parentKey: 'WEB-10' });
      throw new Error('expected reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).message).toBe(CONVERT_CONFIRM_MESSAGE);
      expect((err as ApiError).extra).toMatchObject({ needsConfirm: true, comments: 1 });
    }
    expect(posted).toEqual([]);
  });

  test('becomes a checklist item and copies history onto the parent', async () => {
    posted.length = 0;
    const { db, updates, child } = makeDb({
      child: taskRow({ number: 50, assigneeId: 'u-ann', dueDate: new Date('2026-11-20T00:00:00.000Z') }),
      parent: taskRow({ id: 'parent-1', number: 10, title: 'Month close' }),
      comments: [{ body: '<p>Keep this</p>', author: { name: 'Hannah' } }],
      attachments: [{ name: 'scan.pdf' }],
      activity: [{ action: 'created this improvement' }, { action: 'moved to WIP' }],
    });
    const result = await convertTaskToSubtask(authWith(db), 'WEB-50', { parentKey: 'WEB-10', confirm: true });
    expect(result.parentKey).toBe('WEB-10');
    expect(result.redirectedTo).toBe('WEB-10');
    expect(result.subtask.assigneeId).toBe('u-ann');
    expect(result.subtask.dueDate).toBe('2026-11-20');
    expect(updates[0]).toMatchObject({ id: child.id, parentId: 'parent-1', planningParentId: null });
    expect(posted[0]).toContain('Keep this');
    expect(posted[0]).toContain('scan.pdf');
    expect(posted[0]).toContain('moved to WIP');
  });

  test('moves a clean task under another without a warning copy', async () => {
    posted.length = 0;
    const { db, updates } = makeDb({
      child: taskRow({ number: 50, description: '' }),
      parent: taskRow({ id: 'parent-1', number: 10, title: 'Month close' }),
    });
    const result = await convertTaskToSubtask(authWith(db), 'WEB-50', { parentKey: 'WEB-10' });
    expect(result.subtask.title).toBe('Write invoice notes');
    expect(updates[0]).toMatchObject({ parentId: 'parent-1' });
    expect(posted).toEqual([]);
  });
});

describe('promote subtask to a task', () => {
  test('clears the parent and keeps assignee and due date', async () => {
    const child = taskRow({
      id: 'sub-1',
      number: 51,
      parentId: 'parent-1',
      assigneeId: 'u-ann',
      dueDate: new Date('2026-12-01T00:00:00.000Z'),
    });
    const parent = taskRow({ id: 'parent-1', number: 10, title: 'Month close' });
    const { db, updates } = makeDb({ child, parent });
    const promoted = await promoteSubtask(authWith(db), 'WEB-10', 'sub-1');
    expect(updates[0]).toMatchObject({ id: 'sub-1', parentId: null });
    expect(promoted.assigneeId).toBe('u-ann');
    expect(promoted.dueDate).toBe('2026-12-01');
    expect(promoted.key).toBe('WEB-51');
  });
});
