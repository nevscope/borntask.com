import type { TenantClient } from '../tenantPrisma.js';

const DEFAULT_LABEL_COLOUR = '#5B6157';

export async function setTaskLabels(
  db: TenantClient,
  input: { tenantId: string; projectId: string; taskId: string; names: string[] },
) {
  const names = [...new Set(input.names.map((name) => name.trim()).filter(Boolean))];
  const existing = await db.label.findMany({ where: { projectId: input.projectId } });
  const byFold = new Map(existing.map((label) => [label.name.toLowerCase(), label]));
  const ids: string[] = [];
  for (const name of names) {
    const found = byFold.get(name.toLowerCase());
    if (found) {
      ids.push(found.id);
      continue;
    }
    const created = await db.label.create({
      data: { tenantId: input.tenantId, projectId: input.projectId, name, colour: DEFAULT_LABEL_COLOUR },
    });
    byFold.set(name.toLowerCase(), created);
    ids.push(created.id);
  }
  await db.taskLabel.deleteMany({ where: { taskId: input.taskId } });
  if (!ids.length) return;
  await db.taskLabel.createMany({
    data: ids.map((labelId) => ({ tenantId: input.tenantId, taskId: input.taskId, labelId })),
  });
}
