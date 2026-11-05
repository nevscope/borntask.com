export const TASK_LINK_KINDS = ['blocks', 'relates', 'duplicates'] as const;
export type TaskLinkKind = (typeof TASK_LINK_KINDS)[number];

export const TASK_LINK_RELATIONS = ['blocks', 'blocked_by', 'relates', 'duplicates'] as const;
export type TaskLinkRelation = (typeof TASK_LINK_RELATIONS)[number];

export const TASK_LINK_VIEWS = ['blocks', 'blocked_by', 'relates', 'duplicates', 'duplicated_by'] as const;
export type TaskLinkView = (typeof TASK_LINK_VIEWS)[number];

export const TASK_LINK_LABELS: Record<TaskLinkView, string> = {
  blocks: 'Blocks',
  blocked_by: 'Blocked by',
  relates: 'Relates to',
  duplicates: 'Duplicates',
  duplicated_by: 'Duplicated by',
};

export function isTaskLinkRelation(value: string): value is TaskLinkRelation {
  return (TASK_LINK_RELATIONS as readonly string[]).includes(value);
}

/** Store one directed row for each user-facing relation. Relates is canonicalised so either side can add it. */
export function directedTaskLink(
  fromTaskId: string,
  toTaskId: string,
  relation: TaskLinkRelation,
): { fromTaskId: string; toTaskId: string; kind: TaskLinkKind } {
  if (relation === 'blocks') return { fromTaskId, toTaskId, kind: 'blocks' };
  if (relation === 'blocked_by') return { fromTaskId: toTaskId, toTaskId: fromTaskId, kind: 'blocks' };
  if (relation === 'duplicates') return { fromTaskId, toTaskId, kind: 'duplicates' };
  const [left, right] = fromTaskId < toTaskId ? [fromTaskId, toTaskId] : [toTaskId, fromTaskId];
  return { fromTaskId: left, toTaskId: right, kind: 'relates' };
}

export function viewTaskLink(currentTaskId: string, fromTaskId: string, toTaskId: string, kind: TaskLinkKind): TaskLinkView {
  if (kind === 'blocks') return currentTaskId === fromTaskId ? 'blocks' : 'blocked_by';
  if (kind === 'duplicates') return currentTaskId === fromTaskId ? 'duplicates' : 'duplicated_by';
  return 'relates';
}

export function otherTaskId(currentTaskId: string, fromTaskId: string, toTaskId: string): string {
  return currentTaskId === fromTaskId ? toTaskId : fromTaskId;
}

/** A task is blocked while another live, unfinished task still blocks it. */
export function isTaskBlocked(
  taskId: string,
  links: Array<{ fromTaskId: string; toTaskId: string; kind: TaskLinkKind }>,
  otherOpen: (id: string) => boolean,
): boolean {
  return links.some((link) => link.kind === 'blocks' && link.toTaskId === taskId && otherOpen(link.fromTaskId));
}
