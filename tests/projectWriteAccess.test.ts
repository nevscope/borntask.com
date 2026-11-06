import { describe, expect, test } from 'vitest';
import type { Authed } from '../apps/api/src/context.ts';
import { ApiError } from '../apps/api/src/errors.ts';
import { requireProjectWrite } from '../apps/api/src/lib/projectAccess.ts';

function auth(workspaceRole: Authed['workspaceRole']): Authed {
  return { workspaceRole } as Authed;
}

describe('requireProjectWrite', () => {
  test('guests and viewers cannot change a project', () => {
    for (const role of ['guest', 'viewer'] as const) {
      try {
        requireProjectWrite(auth(role));
        throw new Error(`${role} was allowed to write`);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(403);
      }
    }
  });

  test('members can write', () => {
    expect(() => requireProjectWrite(auth('member'))).not.toThrow();
    expect(() => requireProjectWrite(auth('owner'))).not.toThrow();
  });
});
