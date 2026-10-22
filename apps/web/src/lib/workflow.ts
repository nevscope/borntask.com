// Workflow rules, shared by the board, the task drawer, My tasks and the mock API.
// The Fastify API must enforce the same rules in moveTask(); the UI only uses them to show
// what is possible before the user tries.
import type { BuiltinProjectRole, ProjectRole, Task, Transition, Workflow, WorkflowStatus, WorkspaceRole } from '../api/types';
import { roleStyle } from '../theme/tokens';

export type MoveCheck =
  | { kind: 'allowed'; transition: Transition }
  | { kind: 'not-allowed'; transition: Transition; reason: string }
  | { kind: 'no-path'; reason: string };

export function statusById(wf: Workflow, id: string): WorkflowStatus | undefined {
  return wf.statuses.find((s) => s.id === id);
}

/** Main done stage (Done / Deployed), not side stages such as Rejected. */
export function primaryDoneStatus(wf: Workflow): WorkflowStatus | undefined {
  return wf.statuses.find((status) => status.category === 'done' && !status.side);
}

/** Anyone may move on this workflow: no role gates on any step. */
export function isOpenWorkflow(wf: Workflow): boolean {
  return wf.transitions.length > 0 && wf.transitions.every((row) => row.roles.length === 0);
}

/** Status to send a list-row complete click to, or null if the task is already finished. */
export function completeTarget(wf: Workflow, task: Pick<Task, 'statusId' | 'previousStatusId'>): WorkflowStatus | null {
  const done = primaryDoneStatus(wf);
  const from = statusById(wf, task.statusId);
  if (!done || !from || from.id === done.id || from.category === 'done' || from.side) return null;
  return done;
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
  const listed =
    wf.transitions.find((t) => t.to === toId && t.from === task.statusId) ??
    wf.transitions.find((t) => t.to === toId && t.from === '*' && fromStatus?.category !== 'done') ??
    null;
  if (listed) return listed;
  const done = primaryDoneStatus(wf);
  if (
    done &&
    toId === done.id &&
    fromStatus &&
    !fromStatus.side &&
    fromStatus.category !== 'done' &&
    task.statusId !== 'on_hold' &&
    isOpenWorkflow(wf)
  ) {
    return { from: task.statusId, to: toId, roles: [], requireComment: false, label: 'Complete' };
  }
  return null;
}

export function rolesLabel(roles: ProjectRole[]): string {
  return roles.map((r) => (r in roleStyle ? roleStyle[r as BuiltinProjectRole].label : r)).join(' or ');
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

/** Bugs skip approval when that stage exists; otherwise the first main backlog stage. */
export function initialStatusFor(type: Task['type'], workflow?: Workflow): string {
  if (workflow) {
    const wanted = type === 'bug' ? ['approved', 'new', 'todo', 'submitted', 'backlog', 'idea'] : ['idea', 'new', 'todo', 'submitted', 'backlog'];
    for (const id of wanted) {
      if (workflow.statuses.some((status) => status.id === id && !status.side)) return id;
    }
    return workflow.statuses.find((status) => status.category === 'backlog' && !status.side)?.id
      ?? workflow.statuses[0]?.id
      ?? 'idea';
  }
  return type === 'bug' ? 'approved' : 'idea';
}
