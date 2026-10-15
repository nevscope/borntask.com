const PREFIX = 'bt-recent-projects';
const LIMIT = 10;

function storageKey(workspaceId: string) {
  return `${PREFIX}:${workspaceId}`;
}

export function readRecentProjectKeys(workspaceId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is string => typeof key === 'string').slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function recordRecentProject(workspaceId: string, projectKey: string): string[] {
  const next = [projectKey, ...readRecentProjectKeys(workspaceId).filter((key) => key !== projectKey)].slice(0, LIMIT);
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
  return next;
}
