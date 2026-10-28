const KEY = 'bt-list-collapsed';

function storageKey(projectKey: string, groupBy: string) {
  return `${projectKey}:${groupBy}`;
}

function readAll(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((id) => typeof id === 'string')) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function readCollapsedGroups(projectKey: string, groupBy: string): string[] {
  return readAll()[storageKey(projectKey, groupBy)] ?? [];
}

export function writeCollapsedGroups(projectKey: string, groupBy: string, ids: string[]) {
  try {
    const all = readAll();
    const key = storageKey(projectKey, groupBy);
    if (ids.length === 0) delete all[key];
    else all[key] = ids;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore quota / private mode */
  }
}
