import { pickAssigneeForRole, type AutomationRule } from '@borntask/shared';
import type { Authed } from '../context.js';
import { actorName, enqueueChat, enqueuePersonalChat, taskUrl, userName } from './chatNotify.js';
import { taskKey } from './loadProject.js';

function chatEvent(statusSlug: string) {
  if (statusSlug === 'deployed') return 'deployed' as const;
  if (statusSlug === 'ready_for_testing') return 'ready_for_testing' as const;
  return 'status_change' as const;
}

function personalEvent(statusSlug: string) {
  return statusSlug === 'deployed' ? ('reporter_deployed' as const) : ('watch_stage' as const);
}

async function projectMembers(auth: Authed, projectId: string, leadId: string | null) {
  const members = await auth.db.projectMember.findMany({
    where: { projectId },
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return members.map((member) => ({
    userId: member.userId,
    roleSlugs: member.roles.map((grant) => grant.role.slug),
    isLead: member.userId === leadId,
  }));
}

export async function runProjectAutomations(
  auth: Authed,
  input: {
    projectId: string;
    leadId: string | null;
    taskId: string;
    taskNumber: number;
    title: string;
    projectKey: string;
    projectName: string;
    toSlug: string;
    statusName: string;
    currentAssigneeId: string | null;
  },
): Promise<void> {
  const rules = await auth.db.automation.findMany({
    where: { projectId: input.projectId, onStatusSlug: input.toSlug, enabled: true },
  });
  for (const rule of rules as AutomationRule[]) {
    try {
      if (rule.action === 'assign_role') {
        await assignForRole(auth, input, rule.roleSlug);
      } else if (rule.action === 'notify_role') {
        await notifyForRole(auth, input, rule.roleSlug);
      }
    } catch (err) {
      console.error('[automations] rule failed', rule.action, err);
    }
  }
}

async function assignForRole(
  auth: Authed,
  input: Parameters<typeof runProjectAutomations>[1],
  roleSlug: string,
) {
  const members = await projectMembers(auth, input.projectId, input.leadId);
  const userId = pickAssigneeForRole(members, roleSlug);
  if (!userId || userId === input.currentAssigneeId) return;

  await auth.db.task.update({ where: { id: input.taskId }, data: { assigneeId: userId } });
  const assignee = await userName(userId);
  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: input.taskId,
      actorId: auth.userId,
      actorType: 'automation',
      via: 'automation',
      action: assignee ? `assigned this to ${assignee}` : 'assigned this task',
      fromJson: { assigneeId: input.currentAssigneeId },
      toJson: { assigneeId: userId, roleSlug },
    },
  });
  await auth.db.notification.create({
    data: { tenantId: auth.tenantId, userId, taskId: input.taskId, kind: 'assigned' },
  });
  const name = await actorName(auth.userId);
  const keyLabel = taskKey(input.projectKey, input.taskNumber);
  const assignedJob = {
    projectId: input.projectId,
    event: 'assigned' as const,
    title: input.title,
    taskKey: keyLabel,
    projectName: input.projectName,
    text: assignee ? `${name} assigned it to ${assignee}.` : `${name} assigned it.`,
    url: taskUrl(input.projectKey, keyLabel),
  };
  await enqueueChat(auth, assignedJob);
  await enqueuePersonalChat(auth, userId, assignedJob);
}

async function notifyForRole(
  auth: Authed,
  input: Parameters<typeof runProjectAutomations>[1],
  roleSlug: string,
) {
  const members = (await projectMembers(auth, input.projectId, input.leadId)).filter((member) =>
    member.roleSlugs.includes(roleSlug),
  );
  if (!members.length) return;
  const name = await actorName(auth.userId);
  const keyLabel = taskKey(input.projectKey, input.taskNumber);
  const text = `${name} moved it to ${input.statusName}.`;
  const url = taskUrl(input.projectKey, keyLabel);
  const job = {
    projectId: input.projectId,
    event: chatEvent(input.toSlug),
    title: input.title,
    taskKey: keyLabel,
    projectName: input.projectName,
    text,
    url,
  };
  await enqueueChat(auth, job);
  const personal = { ...job, event: personalEvent(input.toSlug) };
  for (const member of members) {
    if (member.userId === auth.userId) continue;
    await auth.db.notification.create({
      data: { tenantId: auth.tenantId, userId: member.userId, taskId: input.taskId, kind: 'moved' },
    });
    await enqueuePersonalChat(auth, member.userId, personal);
  }
  await auth.db.activityLog.create({
    data: {
      tenantId: auth.tenantId,
      taskId: input.taskId,
      actorId: auth.userId,
      actorType: 'automation',
      via: 'automation',
      action: `notified the ${roleSlug} role`,
      toJson: { roleSlug, status: input.toSlug },
    },
  });
}
