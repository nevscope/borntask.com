// Workflow rules, shared by the board, the task drawer, My tasks and the mock API.
// The Fastify API must enforce the same rules in moveTask(); the UI only uses them to show
// what is possible before the user tries.
import type { ProjectRole, Task, Transition, Workflow, WorkflowStatus, WorkspaceRole } from '../api/types';
import { roleStyle } from '../theme/tokens';

export type MoveCheck =
  | { kind: 'allowed'; transition: Transition }
  | { kind: 'not-allowed'; transition: Transition; reason: string }
  | { kind: 'no-path'; reason: string };

export function statusById(wf: Workflow, id: string): WorkflowStatus | undefined {
  return wf.statuses.find((s) => s.id === id);
}

export function findTransition(wf: Workflow, task: Pick<Task, 'statusId' | 'previousStatusId'>, toId: string): Transition | null {
  if (task.statusId === toId) return null;
  // Leaving On hold always returns to where the task came from, for any project member.
  if (task.statusId === 'on_hold') {
    return task.previousStatusId === toId
      ? { from: 'on_hold', to: toId, roles: [], requireComment: false, label: 'Resume' }
      : null;
  }
  const fromStatus = statusById(wf, task.statusId);
  return (
    wf.transitions.find((t) => t.to === toId && t.from === task.statusId) ??
    wf.transitions.find((t) => t.to === toId && t.from === '*' && fromStatus?.category !== 'done') ??
    null
  );
}

export function rolesLabel(roles: ProjectRole[]): string {
  return roles.map((r) => roleStyle[r].label).join(' or ');
}

export function checkMove(wf: Workflow, task: Pick<Task, 'statusId' | 'previousStatusId'>, toId: string, myRoles: ProjectRole[]): MoveCheck {
  const t = findTransition(wf, task, toId);
  if (!t) return { kind: 'no-path', reason: 'Not a step in this workflow' };
  if (t.roles.length === 0 || t.roles.some((r) => myRoles.includes(r))) return { kind: 'allowed', transition: t };
  return { kind: 'not-allowed', transition: t, reason: `${rolesLabel(t.roles)} only` };
}

/** Every status the task could go to next, with whether *I* may make the move. */
export function moveOptions(wf: Workflow, task: Pick<Task, 'statusId' | 'previousStatusId'>, myRoles: ProjectRole[]) {
  return wf.statuses
    .filter((s) => s.id !== task.statusId)
    .map((status) => ({ status, check: checkMove(wf, task, status.id, myRoles) }))
    .filter((o) => o.check.kind !== 'no-path');
}

export function canOverride(workspaceRole: WorkspaceRole, myRoles: ProjectRole[]): boolean {
  return workspaceRole === 'owner' || workspaceRole === 'admin' || myRoles.includes('lead');
}

/** Bugs skip approval (workspace setting, default on); everything else starts as an Idea. */
export function initialStatusFor(type: Task['type']): string {
  return type === 'bug' ? 'approved' : 'idea';
}
