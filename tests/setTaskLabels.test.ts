import { describe, expect, test } from 'vitest';
import { setTaskLabels } from '../apps/api/src/lib/setTaskLabels.ts';
import type { TenantClient } from '../apps/api/src/tenantPrisma.ts';

function mockDb() {
  const labels: { id: string; projectId: string; name: string; colour: string }[] = [
    { id: 'l_bug', projectId: 'p1', name: 'Bug', colour: '#5B6157' },
  ];
  const links: { taskId: string; labelId: string }[] = [{ taskId: 't1', labelId: 'l_bug' }];
  let n = 0;
  const db = {
    label: {
      findMany: async ({ where }: { where: { projectId: string } }) => labels.filter((row) => row.projectId === where.projectId),
      create: async ({ data }: { data: { tenantId: string; projectId: string; name: string; colour: string } }) => {
        const row = { id: `l_${++n}`, projectId: data.projectId, name: data.name, colour: data.colour };
        labels.push(row);
        return row;
      },
    },
    taskLabel: {
      deleteMany: async ({ where }: { where: { taskId: string } }) => {
        for (let i = links.length - 1; i >= 0; i--) {
          if (links[i]!.taskId === where.taskId) links.splice(i, 1);
        }
      },
      createMany: async ({ data }: { data: { tenantId: string; taskId: string; labelId: string }[] }) => {
        for (const row of data) links.push({ taskId: row.taskId, labelId: row.labelId });
      },
    },
  } as unknown as TenantClient;
  return { db, labels, links };
}

describe('setTaskLabels', () => {
  test('replaces links and reuses a label that already exists on the project', async () => {
    const { db, labels, links } = mockDb();
    await setTaskLabels(db, { tenantId: 'ws1', projectId: 'p1', taskId: 't1', names: ['Bug', 'Completed'] });
    expect(labels.map((row) => row.name)).toEqual(['Bug', 'Completed']);
    expect(links.map((row) => row.labelId)).toEqual(['l_bug', 'l_1']);
  });

  test('clears every label when the list is empty', async () => {
    const { db, links } = mockDb();
    await setTaskLabels(db, { tenantId: 'ws1', projectId: 'p1', taskId: 't1', names: [] });
    expect(links).toEqual([]);
  });
});
