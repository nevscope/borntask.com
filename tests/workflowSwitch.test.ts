import { describe, expect, test } from 'vitest';
import { mapPreviousStage, mapStage, type StageRef } from '../apps/api/src/lib/switchProjectWorkflow.ts';

const delivery: StageRef[] = [
  { id: 'idea', slug: 'idea', name: 'Idea', category: 'backlog', position: 0 },
  { id: 'approved', slug: 'approved', name: 'Approved', category: 'backlog', position: 1 },
  { id: 'wip', slug: 'wip', name: 'WIP', category: 'active', position: 2 },
  { id: 'testing', slug: 'testing', name: 'Testing', category: 'review', position: 4 },
  { id: 'deployed', slug: 'deployed', name: 'Deployed', category: 'done', position: 5 },
  { id: 'on_hold', slug: 'on_hold', name: 'On hold', category: 'backlog', position: 90 },
];

const simple: StageRef[] = [
  { id: 'todo', slug: 'todo', name: 'To do', category: 'backlog', position: 0 },
  { id: 'doing', slug: 'doing', name: 'Doing', category: 'active', position: 1 },
  { id: 'done', slug: 'done', name: 'Done', category: 'done', position: 2 },
];

describe('project workflow switch', () => {
  test('keeps a stage when the new workflow has the same name', () => {
    expect(mapStage(simple, { slug: 'doing', name: 'Doing', category: 'active' })?.slug).toBe('doing');
    expect(mapStage(
      [{ id: 'custom', slug: 'in_progress', name: 'Doing', category: 'active', position: 0 }],
      { slug: 'doing', name: 'Doing', category: 'active' },
    )?.id).toBe('custom');
  });

  test('moves other stages to the first stage in the same group', () => {
    expect(mapStage(simple, { slug: 'idea', category: 'backlog' })?.slug).toBe('todo');
    expect(mapStage(simple, { slug: 'wip', category: 'active' })?.slug).toBe('doing');
    expect(mapStage(simple, { slug: 'deployed', category: 'done' })?.slug).toBe('done');
    expect(mapStage(delivery, { slug: 'todo', category: 'backlog' })?.slug).toBe('idea');
  });

  test('moves review stages to the first active stage when the workflow has no review', () => {
    expect(mapStage(simple, { slug: 'testing', category: 'review' })?.slug).toBe('doing');
  });

  test('drops a remembered stage that the new workflow does not have', () => {
    expect(mapPreviousStage(simple, 'approved')).toBeNull();
    expect(mapPreviousStage(delivery, 'wip')).toBe('wip');
  });
});
