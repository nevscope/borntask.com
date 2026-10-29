import type { Authed } from '../context.js';
import { ApiError, validation } from '../errors.js';
import { actorName, enqueueChat, taskUrl } from './chatNotify.js';
import { findTaskByKey, mapTask, taskKey } from './loadProject.js';
import { publishTaskChange } from './live.js';
import { nextPosition, typeIsDisabled } from './mappers.js';
import { requireOpenProjectWrite } from './projectAccess.js';
import { mapPreviousStage, mapStage, type StageRef } from './switchProjectWorkflow.js';

export async function moveTaskToProject(
  auth: Authed,
  key: string,
  input: { projectKey: string; sectionId?: string },
) {
  const row = await findTaskByKey(auth.db, key);
  if (!row || row.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Task not found.');
  await requireOpenProjectWrite(auth, row.project.key);
  const dest = await requireOpenProjectWrite(auth, input.projectKey);
  if (dest.archivedAt) throw validation('That project is archived.');
  if (dest.id === row.projectId) throw validation('Choose a different project.');
  if (typeIsDisabled(dest.disabledTypes, row.type.slug)) {
    throw validation(`This project does not use ${row.type.name} tasks.`);
  }

  const destSections = await auth.db.section.findMany({ where: { projectId: dest.id }, orderBy: { position: 'asc' } });
  const section = input.sectionId
    ? destSections.find((item) => item.id === input.sectionId)
    : destSections[0];
  if (!section) throw validation('Choose a section in that project.');

  const destStatuses = await auth.db.workflowStatus.findMany({ where: { workflowId: dest.workflowId } });
  const target: StageRef[] = destStatuses.map((stage) => ({
    id: stage.id,
    slug: stage.slug,
    name: stage.name,
    category: stage.category,
    position: stage.position,
  }));
  const mapped = mapStage(target, row.status);
  if (!mapped) throw validation('That project has no stages.');
  const previousStatusId = mapPreviousStage(target, row.previousStatus?.slug);

  const destMembers = await auth.db.projectMember.findMany({
    where: { projectId: dest.id },
    select: { userId: true },
  });
  const destUserIds = new Set(destMembers.map((member) => member.userId));
  if (dest.leadId) destUserIds.add(dest.leadId);
  const assigneeId = row.assigneeId && destUserIds.has(row.assigneeId) ? row.assigneeId : null;

  const children = await auth.db.task.findMany({
    where: { parentId: row.id, deletedAt: null },
    include: { status: true, previousStatus: true, labels: { include: { label: true } } },
  });
  const moving = [row, ...children];

  const last = await auth.db.task.findFirst({ where: { projectId: dest.id }, orderBy: { number: 'desc' } });
  let nextNumber = (last?.number ?? 0) + 1;
  const firstNumber = nextNumber;
  const lastInSection = await auth.db.task.findFirst({
    where: { sectionId: section.id, deletedAt: null },
    orderBy: { position: 'desc' },
  });
  let position = lastInSection?.position ?? null;

  const oldKey = taskKey(row.project.key, row.number);
  const oldProjectKey = row.project.key;
  const oldProjectName = row.project.name;

  for (const task of moving) {
    const childMapped = task.id === row.id ? mapped : mapStage(target, task.status) ?? mapped;
    const childPrevious = task.id === row.id
      ? previousStatusId
      : mapPreviousStage(target, task.previousStatus?.slug);
    const childDone = childMapped.category === 'done';
    position = nextPosition(position);
    const number = nextNumber;
    nextNumber += 1;
    await auth.db.task.update({
      where: { id: task.id },
      data: {
        projectId: dest.id,
        number,
        sectionId: section.id,
        statusId: childMapped.id,
        previousStatusId: childPrevious,
        parentId: task.id === row.id ? null : row.id,
        planningParentId: null,
        assigneeId: task.id === row.id ? assigneeId : task.assigneeId && destUserIds.has(task.assigneeId) ? task.assigneeId : null,
        completedAt: childDone ? (task.completedAt ?? new Date()) : null,
        position,
      },
    });
    await transferLabels(auth, dest.id, task.id, task.labels.map((link) => link.label));
  }

  const updated = await findTaskByKey(auth.db, taskKey(dest.key, firstNumber));
  if (!updated) throw new ApiError(500, 'SERVER', 'Could not reload the moved task.');
  const mappedTask = mapTask(updated);
  const newKey = mappedTask.key;

  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: row.id,
      actorId: auth.userId,
      actorType: auth.actorType,
      via: auth.via,
      action: `moved from ${oldKey} in ${oldProjectName} to ${newKey}`,
      fromJson: { projectKey: oldProjectKey, key: oldKey },
      toJson: { projectKey: dest.key, key: newKey, sectionId: section.id },
    },
  });

  publishTaskChange(auth, { key: oldKey, projectKey: oldProjectKey }, 'delete');
  publishTaskChange(auth, mappedTask, 'create');

  const name = await actorName(auth.userId);
  await enqueueChat(auth, {
    projectId: dest.id,
    event: 'status_change',
    title: updated.title,
    taskKey: newKey,
    projectName: dest.name,
    text: `${name} moved this from ${oldProjectName} (${oldKey}).`,
    url: taskUrl(dest.key, newKey),
  });

  return mappedTask;
}

async function transferLabels(
  auth: Authed,
  destProjectId: string,
  taskId: string,
  labels: { name: string; colour: string }[],
) {
  await auth.db.taskLabel.deleteMany({ where: { taskId } });
  for (const label of labels) {
    const existing = await auth.db.label.findFirst({
      where: { projectId: destProjectId, name: label.name },
    });
    const destLabel = existing ?? await auth.db.label.create({
      data: { tenantId: auth.tenantId, projectId: destProjectId, name: label.name, colour: label.colour },
    });
    await auth.db.taskLabel.create({
      data: { tenantId: auth.tenantId, taskId, labelId: destLabel.id },
    });
  }
}
