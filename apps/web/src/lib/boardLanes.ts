/** Drop targets are namespaced so the same status can appear in more than one swimlane. */
export function laneDropId(assigneeKey: string, statusId: string): string {
  return `lane:${assigneeKey}:${statusId}`;
}

export function statusFromDropId(id: string): string {
  if (!id.startsWith('lane:')) return id;
  return id.slice(id.lastIndexOf(':') + 1);
}
