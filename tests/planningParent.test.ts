import { describe, expect, test } from 'vitest';
import { ApiError } from '../apps/api/src/errors.ts';
import { resolvePlanningParent } from '../apps/api/src/lib/planning.ts';
import type { TenantClient } from '../apps/api/src/tenantPrisma.ts';

function dbWith(parent: { id: string; typeSlug: string; planningParentId?: string | null } | null): TenantClient {
  return {
    task: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        if (!parent || where.id !== parent.id) return null;
        return { id: parent.id, planningParentId: parent.planningParentId ?? null, type: { slug: parent.typeSlug } };
      },
    },
  } as unknown as TenantClient;
}

async function rejectMessage(run: () => Promise<unknown>) {
  try {
    await run();
    throw new Error('expected reject');
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return (err as ApiError).message;
  }
}

describe('planning parent create and update', () => {
  test('sets a story parent on create', async () => {
    const id = await resolvePlanningParent(dbWith({ id: 'story-1', typeSlug: 'story' }), { id: 'p1', workBreakdown: 'stories' }, 'bug', 'story-1');
    expect(id).toBe('story-1');
  });

  test('updates a parent to an epic', async () => {
    const id = await resolvePlanningParent(
      dbWith({ id: 'epic-1', typeSlug: 'epic' }),
      { id: 'p1', workBreakdown: 'epics_stories' },
      'story',
      'epic-1',
      'story-2',
    );
    expect(id).toBe('epic-1');
  });

  test('rejects a task parenting itself', async () => {
    const message = await rejectMessage(() =>
      resolvePlanningParent(dbWith({ id: 'story-1', typeSlug: 'story' }), { id: 'p1', workBreakdown: 'stories' }, 'bug', 'story-1', 'story-1'),
    );
    expect(message).toBe('A task cannot be part of itself.');
  });

  test('rejects story and epic when work breakdown is off', async () => {
    const message = await rejectMessage(() =>
      resolvePlanningParent(dbWith(null), { id: 'p1', workBreakdown: 'off' }, 'story', null),
    );
    expect(message).toBe('Turn on work breakdown for this project to use that type.');
  });

  test('rejects a loop when the parent already sits under the child', async () => {
    const message = await rejectMessage(() =>
      resolvePlanningParent(
        dbWith({ id: 'epic-1', typeSlug: 'epic', planningParentId: 'story-1' }),
        { id: 'p1', workBreakdown: 'epics_stories' },
        'story',
        'epic-1',
        'story-1',
      ),
    );
    expect(message).toBe('That would create a loop.');
  });
});
