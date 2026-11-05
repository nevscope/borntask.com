import { describe, expect, test } from 'vitest';
import { directedTaskLink, isTaskBlocked } from '@borntask/shared';
import { blockedTaskIds, deleteTaskLinkRow, insertTaskLink } from '../apps/api/src/lib/taskLinks.ts';
import { tokenAllows } from '../apps/api/src/lib/tokenPolicy.ts';
import type { TenantClient } from '../apps/api/src/tenantPrisma.ts';

function mockDb() {
  const links: { id: string; fromTaskId: string; toTaskId: string; kind: 'blocks' | 'relates' | 'duplicates'; fromOpen?: boolean }[] = [];
  let n = 0;
  const db = {
    taskLink: {
      findFirst: async ({ where }: { where: { fromTaskId?: string; toTaskId?: string; kind?: string; id?: string } }) =>
        links.find((row) => {
          if (where.id) return row.id === where.id;
          return row.fromTaskId === where.fromTaskId && row.toTaskId === where.toTaskId && row.kind === where.kind;
        }) ?? null,
      create: async ({ data }: { data: { tenantId: string; fromTaskId: string; toTaskId: string; kind: 'blocks' | 'relates' | 'duplicates' } }) => {
        const row = { id: `lk_${++n}`, ...data, fromOpen: true };
        links.push(row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = links.findIndex((row) => row.id === where.id);
        if (i >= 0) links.splice(i, 1);
      },
      findMany: async ({ where }: { where: { kind?: string; toTaskId?: { in: string[] }; from?: { deletedAt: null; completedAt: null } } }) =>
        links
          .filter((row) => row.kind === where.kind && where.toTaskId?.in.includes(row.toTaskId) && row.fromOpen !== false)
          .map((row) => ({ toTaskId: row.toTaskId })),
    },
  } as unknown as TenantClient;
  return { db, links };
}

describe('task links', () => {
  test('creates a blocks link and removes it', async () => {
    const { db, links } = mockDb();
    const row = await insertTaskLink(db, 'ws1', 'task-a', 'task-b', 'blocks');
    expect(row).toMatchObject({ fromTaskId: 'task-a', toTaskId: 'task-b', kind: 'blocks' });
    expect(links).toHaveLength(1);
    await deleteTaskLinkRow(db, row.id);
    expect(links).toHaveLength(0);
  });

  test('stores blocked by as the reverse blocks row and reuses an existing link', async () => {
    const { db, links } = mockDb();
    const first = await insertTaskLink(db, 'ws1', 'task-a', 'task-b', 'blocks');
    const again = await insertTaskLink(db, 'ws1', 'task-b', 'task-a', 'blocked_by');
    expect(again.id).toBe(first.id);
    expect(links).toHaveLength(1);
  });

  test('marks a task blocked while the blocker is still open', async () => {
    const { db, links } = mockDb();
    await insertTaskLink(db, 'ws1', 'blocker', 'blocked', 'blocks');
    expect([...await blockedTaskIds(db, ['blocked', 'blocker'])]).toEqual(['blocked']);
    links[0]!.fromOpen = false;
    expect([...await blockedTaskIds(db, ['blocked'])]).toEqual([]);
  });

  test('blocked marker uses only open blockers', () => {
    const links = [directedTaskLink('blocker', 'blocked', 'blocks')];
    expect(isTaskBlocked('blocked', links, (id) => id === 'blocker')).toBe(true);
    expect(isTaskBlocked('blocked', links, () => false)).toBe(false);
    expect(isTaskBlocked('blocker', links, () => true)).toBe(false);
  });

  test('lets MCP remove a task link without allowing task deletes', () => {
    expect(tokenAllows('POST', '/tasks/WEB-142/links', 'read_write')).toEqual({ ok: true });
    expect(tokenAllows('DELETE', '/tasks/WEB-142/links/lk_1', 'read_write')).toEqual({ ok: true });
    expect(tokenAllows('DELETE', '/tasks/WEB-142', 'read_write')).toEqual({
      ok: false,
      message: 'Personal tokens and MCP cannot delete tasks.',
    });
  });
});
