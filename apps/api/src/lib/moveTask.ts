import { GITHUB_BLOCKED, isForwardGithubMove } from '@borntask/shared';
import type { Authed } from '../context.js';
import { ApiError } from '../errors.js';
import { actorName, enqueueChat, enqueuePersonalChat, eventsForStatus, taskUrl } from './chatNotify.js';
import { runProjectAutomations } from './runAutomations.js';
import { findTaskByKey, loadWorkflow, mapTask, taskKey } from './loadProject.js';
import { publishTaskChange } from './live.js';

function jsonStatus(value: unknown): string {
  if (!value || typeof value !== 'object' || !('status' in value)) return '';
  return String((value as { status: unknown }).status ?? '');
}

function canOverride(role: Authed['workspaceRole'], projectRoles: string[]): boolean {
  return role === 'owner' || role === 'admin' || projectRoles.includes('lead');
}

export async function moveTask(
  auth: Authed,
  key: string,
  input: { toStatusId: string; comment?: string; overrideReason?: string; undo?: boolean },
) {
  const row = await findTaskByKey(auth.db, key);
  if (!row || row.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Task not found.');
  const wf = await loadWorkflow(auth.db, row.project.workflowId);
  const fromSlug = row.status.slug;
  const toSlug = input.toStatusId;
  const toId = wf.statusIdBySlug[toSlug];
  if (!toId) throw new ApiError(400, 'VALIDATION', 'Unknown status.');

  const member = await auth.db.projectMember.findFirst({
    where: { projectId: row.projectId, userId: auth.userId },
    include: { roles: { include: { role: true } } },
  });
  const myRoles = member?.roles.map((r) => r.role.slug) ?? [];

  let allowed = false;
  let requireComment = false;
  let transitionLabel: string | null = null;

  if (auth.via === 'github') {
    const positions = wf.statuses.map((s) => ({ slug: s.id, position: s.position }));
    if (GITHUB_BLOCKED.has(toSlug) || !isForwardGithubMove(fromSlug, toSlug, positions)) {
      throw new ApiError(403, 'TRANSITION_NOT_ALLOWED', 'GitHub can only move tasks forward, and never into Testing or Deployed.');
    }
    allowed = true;
  } else if (fromSlug === 'on_hold') {
    allowed = row.previousStatus?.slug === toSlug;
  } else {
    const match = wf.transitions.find((t) => t.to === toSlug && (t.from === fromSlug || t.from === '*'));
    if (match) {
      requireComment = match.requireComment;
      transitionLabel = match.label;
      allowed = match.roles.length === 0 || match.roles.some((r) => myRoles.includes(r));
    }
  }

  if (!allowed && input.undo) {
    const latest = await auth.db.activityLog.findFirst({
      where: { taskId: row.id, actorId: auth.userId },
      orderBy: { at: 'desc' },
    });
    const fromStatus = jsonStatus(latest?.fromJson);
    const toStatus = jsonStatus(latest?.toJson);
    const recent = latest ? Date.now() - latest.at.getTime() < 15 * 60 * 1000 : false;
    if (recent && fromStatus === toSlug && toStatus === fromSlug) {
      allowed = true;
      requireComment = false;
    }
  }

  if (!allowed) {
    if (input.overrideReason && canOverride(auth.workspaceRole, myRoles)) {
      allowed = true;
    } else {
      const match = wf.transitions.find((t) => t.to === toSlug && (t.from === fromSlug || t.from === '*'));
      throw new ApiError(403, 'TRANSITION_NOT_ALLOWED', 'Only certain roles can make this move.', {
        allowedRoles: match?.roles ?? [],
      });
    }
  }

  if (requireComment && !input.comment?.trim()) {
    throw new ApiError(400, 'COMMENT_REQUIRED', 'This move needs a comment.');
  }

  const onHoldId = wf.statusIdBySlug.on_hold;
  const previousStatusId =
    toSlug === 'on_hold' ? row.statusId : fromSlug === 'on_hold' ? null : row.previousStatusId;

  const updated = await auth.db.task.update({
    where: { id: row.id },
    data: {
      statusId: toId,
      previousStatusId: toSlug === 'on_hold' ? row.statusId : previousStatusId,
      completedAt: wf.statuses.find((s) => s.id === toSlug)?.category === 'done' ? new Date() : null,
    },
    include: {
      type: true,
      status: true,
      previousStatus: true,
      section: true,
      project: true,
      labels: { include: { label: true } },
    },
  });

  if (input.comment?.trim()) {
    await auth.db.comment.create({
      data: { tenantId: auth.tenantId, taskId: row.id, authorId: auth.userId, body: input.comment.trim() },
    });
  }

  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: row.id,
      actorId: auth.userId,
      actorType: auth.actorType,
      via: auth.via,
      action: input.undo
        ? `undid the move, back to ${toSlug}`
        : input.overrideReason
          ? `overrode to ${toSlug}: ${input.overrideReason}`
          : transitionLabel
            ? `${transitionLabel.toLowerCase()} → ${toSlug}`
            : `moved to ${toSlug}`,
      fromJson: { status: fromSlug },
      toJson: { status: toSlug, override: Boolean(input.overrideReason) },
    },
  });

  void onHoldId;
  const keyLabel = taskKey(row.project.key, row.number);
  const name = await actorName(auth.userId);
  const statusName = updated.status.name;
  const text = `${name} moved it to ${statusName}.`;
  const url = taskUrl(row.project.key, keyLabel);
  for (const event of eventsForStatus(toSlug)) {
    await enqueueChat(auth, {
      projectId: row.projectId,
      event,
      title: row.title,
      taskKey: keyLabel,
      projectName: row.project.name,
      text,
      url,
    });
  }
  const watchers = await auth.db.taskWatcher.findMany({ where: { taskId: row.id } });
  const stageJob = {
    projectId: row.projectId,
    event: 'watch_stage' as const,
    title: row.title,
    taskKey: keyLabel,
    projectName: row.project.name,
    text,
    url,
  };
  for (const watcher of watchers) {
    await enqueuePersonalChat(auth, watcher.userId, stageJob);
  }
  if (toSlug === 'deployed') {
    await enqueuePersonalChat(auth, row.reporterId, {
      projectId: row.projectId,
      event: 'reporter_deployed',
      title: row.title,
      taskKey: keyLabel,
      projectName: row.project.name,
      text,
      url,
    });
  }
  try {
    await runProjectAutomations(auth, {
      projectId: row.projectId,
      leadId: row.project.leadId,
      taskId: row.id,
      taskNumber: row.number,
      title: row.title,
      projectKey: row.project.key,
      projectName: row.project.name,
      toSlug,
      statusName,
      currentAssigneeId: updated.assigneeId,
    });
  } catch (err) {
    console.error('[automations] after move', err);
  }
  const latest = await findTaskByKey(auth.db, key);
  const mapped = mapTask(latest ?? updated);
  publishTaskChange(auth, mapped, 'move');
  return mapped;
}
