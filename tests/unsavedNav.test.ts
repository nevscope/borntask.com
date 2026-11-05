import { describe, expect, test } from 'vitest';
import { shouldBlockUnsavedNav } from '../apps/web/src/hooks/unsavedNav';

const page = { pathname: '/p/HAN/settings/workflow', search: '', hash: '' };

describe('unsaved navigation', () => {
  test('does not treat overlay Back on the same URL as leaving', () => {
    expect(shouldBlockUnsavedNav(true, page, page)).toBe(false);
    expect(shouldBlockUnsavedNav(true, page, { ...page, search: '?id=wf2' })).toBe(true);
    expect(shouldBlockUnsavedNav(true, page, { pathname: '/p/HAN/list', search: '', hash: '' })).toBe(true);
    expect(shouldBlockUnsavedNav(false, page, { pathname: '/p/HAN/list', search: '', hash: '' })).toBe(false);
  });
});
