import { useEffect, useState } from 'react';

const PREFIX = 'bt-recent-searches';
const LIMIT = 8;

function storageKey(workspaceId: string) {
  return `${PREFIX}:${workspaceId}`;
}

export function readRecentSearches(workspaceId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export const RECENT_SEARCHES_EVENT = 'bt-recent-searches';

export function recordRecentSearch(workspaceId: string, raw: string): string[] {
  const q = raw.trim();
  if (q.length < 2) return readRecentSearches(workspaceId);
  const current = readRecentSearches(workspaceId).filter((item) => item.toLowerCase() !== q.toLowerCase());
  const head = current[0];
  const collapsed =
    head && (q.toLowerCase().startsWith(head.toLowerCase()) || head.toLowerCase().startsWith(q.toLowerCase()))
      ? [q, ...current.slice(1)]
      : [q, ...current];
  const next = collapsed.slice(0, LIMIT);
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
  window.dispatchEvent(new Event(RECENT_SEARCHES_EVENT));
  return next;
}

export function clearRecentSearches(workspaceId: string) {
  localStorage.removeItem(storageKey(workspaceId));
  window.dispatchEvent(new Event(RECENT_SEARCHES_EVENT));
}

export function useRecentSearches(workspaceId: string | undefined) {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    if (!workspaceId) {
      setItems([]);
      return;
    }
    const sync = () => setItems(readRecentSearches(workspaceId));
    sync();
    window.addEventListener(RECENT_SEARCHES_EVENT, sync);
    return () => window.removeEventListener(RECENT_SEARCHES_EVENT, sync);
  }, [workspaceId]);
  return items;
}
