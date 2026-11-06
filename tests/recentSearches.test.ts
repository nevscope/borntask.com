import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { clearRecentSearches, readRecentSearches, recordRecentSearch } from '../apps/web/src/lib/recentSearches.ts';

const store = new Map<string, string>();

describe('recent searches', () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: () => true },
    });
  });

  afterEach(() => {
    clearRecentSearches('ws1');
  });

  test('collapses typing prefixes into one query', () => {
    recordRecentSearch('ws1', 'ch');
    recordRecentSearch('ws1', 'chec');
    recordRecentSearch('ws1', 'checkout');
    expect(readRecentSearches('ws1')).toEqual(['checkout']);
  });

  test('keeps distinct queries and moves a repeat to the front', () => {
    recordRecentSearch('ws1', 'checkout');
    recordRecentSearch('ws1', 'luke');
    recordRecentSearch('ws1', 'checkout');
    expect(readRecentSearches('ws1')).toEqual(['checkout', 'luke']);
  });
});
