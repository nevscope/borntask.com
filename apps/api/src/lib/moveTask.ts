import type { Authed } from '../context.js';
import { ApiError } from '../errors.js';
import { findTaskByKey, loadWorkflow, mapTask } from './loadProject.js';

function canOverride(role: Authed['workspaceRole'], projectRoles: string[]): boolean {
  return role === 'owner' || role === 'admin' || projectRoles.includes('lead');
}

export async function moveTask(
  auth: Authed,
  key: string,
  input: { toStatusId: string; comment?: string; overrideReason?: string },
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

  if (fromSlug === 'on_hold') {
    allowed = row.previousStatus?.slug === toSlug;
  } else {
    const match = wf.transitions.find((t) => t.to === toSlug && (t.from === fromSlug || t.from === '*'));
    if (match) {
      requireComment = match.requireComment;
      transitionLabel = match.label;
      allowed = match.roles.length === 0 || match.roles.some((r) => myRoles.includes(r));
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
      actorType: 'user',
      via: 'app',
      action: input.overrideReason
        ? `overrode to ${toSlug}: ${input.overrideReason}`
        : transitionLabel
          ? `${transitionLabel.toLowerCase()} → ${toSlug}`
          : `moved to ${toSlug}`,
      fromJson: { status: fromSlug },
      toJson: { status: toSlug, override: Boolean(input.overrideReason) },
    },
  });

  void onHoldId;
  return mapTask(updated);
}
