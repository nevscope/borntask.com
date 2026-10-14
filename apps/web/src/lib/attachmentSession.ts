export interface StoredAttachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  previewUrl?: string;
  progress?: number;
}

const byTask = new Map<string, StoredAttachment[]>();

export function rememberTaskAttachments(taskKey: string, items: StoredAttachment[]) {
  byTask.set(taskKey, items);
}

export function readTaskAttachments(taskKey: string): StoredAttachment[] {
  return byTask.get(taskKey) ?? [];
}

export function writeTaskAttachments(taskKey: string, items: StoredAttachment[]) {
  byTask.set(taskKey, items);
}
