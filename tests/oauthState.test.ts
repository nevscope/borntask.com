import { describe, expect, it } from 'vitest';
import { createOauthState, parseOauthState } from '../apps/api/src/lib/oauthState.ts';

describe('oauth state', () => {
  it('round-trips the next path so email links survive Google sign-in', () => {
    const state = createOauthState('', 'acme', '/p/BOR/list?task=BOR-49');
    const parsed = parseOauthState(state);
    expect(parsed?.returnSlug).toBe('acme');
    expect(parsed?.next).toBe('/p/BOR/list?task=BOR-49');
  });
});
