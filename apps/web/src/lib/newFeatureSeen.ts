const KEY = 'bt-new-feature-seen';

export type NewFeatureId = 'timesheets' | 'reports' | 'releases';

function storageKey(userId: string) {
  return `${KEY}:${userId}`;
}

function readAll(userId: string | undefined): NewFeatureId[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is NewFeatureId => row === 'timesheets' || row === 'reports' || row === 'releases');
  } catch {
    return [];
  }
}

export function hasSeenNewFeature(userId: string | undefined, feature: NewFeatureId): boolean {
  return readAll(userId).includes(feature);
}

export function markNewFeatureSeen(userId: string | undefined, feature: NewFeatureId) {
  if (!userId) return;
  const next = new Set(readAll(userId));
  if (next.has(feature)) return;
  next.add(feature);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
}
