export type LastViewedTask = { key: string; title: string; projectKey: string; at: number };

const LEGACY_KEY = 'bt-last-viewed-tasks';
const MAX = 15;

function storageKey(userId: string) {
  return `${LEGACY_KEY}:${userId}`;
}

function dropLegacySharedKey() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function readAll(userId: string | undefined): LastViewedTask[] {
  if (!userId) return [];
  dropLegacySharedKey();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is LastViewedTask =>
      Boolean(row)
      && typeof row === 'object'
      && typeof (row as LastViewedTask).key === 'string'
      && typeof (row as LastViewedTask).title === 'string'
      && typeof (row as LastViewedTask).projectKey === 'string'
      && typeof (row as LastViewedTask).at === 'number',
    );
  } catch {
    return [];
  }
}

export function readLastViewed(userId: string | undefined): LastViewedTask[] {
  return readAll(userId).sort((a, b) => b.at - a.at).slice(0, MAX);
}

export function recordLastViewed(userId: string | undefined, entry: { key: string; title?: string; projectKey?: string }) {
  if (!userId) return;
  const projectKey = entry.projectKey ?? entry.key.split('-')[0] ?? entry.key;
  const title = entry.title?.trim() || entry.key;
  const next = [{ key: entry.key, title, projectKey, at: Date.now() }, ...readAll(userId).filter((row) => row.key !== entry.key)].slice(0, MAX);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

const HIDDEN_KEY = 'bt-show-hidden-sections';

export function readShowHiddenSections(projectKey: string): boolean {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>)[projectKey]);
  } catch {
    return false;
  }
}

export function writeShowHiddenSections(projectKey: string, on: boolean) {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, boolean> : {};
    if (on) parsed[projectKey] = true;
    else delete parsed[projectKey];
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

const PREFS_KEY = 'bt-my-tasks-prefs';

export type MyTasksPrefs = {
  showUnassigned: boolean;
  reportedByMe: boolean;
  projectKey: string;
  priority: string;
  type: string;
  sort: 'due' | 'priority' | 'updated' | 'project';
};

const DEFAULT_PREFS: MyTasksPrefs = {
  showUnassigned: false,
  reportedByMe: false,
  projectKey: '',
  priority: '',
  type: '',
  sort: 'due',
};

export function readMyTasksPrefs(): MyTasksPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<MyTasksPrefs>;
    return {
      showUnassigned: Boolean(parsed.showUnassigned),
      reportedByMe: Boolean(parsed.reportedByMe),
      projectKey: typeof parsed.projectKey === 'string' ? parsed.projectKey : '',
      priority: typeof parsed.priority === 'string' ? parsed.priority : '',
      type: typeof parsed.type === 'string' ? parsed.type : '',
      sort: parsed.sort === 'priority' || parsed.sort === 'updated' || parsed.sort === 'project' ? parsed.sort : 'due',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeMyTasksPrefs(prefs: MyTasksPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
