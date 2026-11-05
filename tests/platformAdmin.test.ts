import { describe, expect, test } from 'vitest';
import { BUILTIN_PLATFORM_ADMIN_EMAIL, isPlatformAdminEmail, LOCAL_TEST_PLATFORM_ADMIN_EMAIL, platformAdminEmails } from '../apps/api/src/lib/platformAdmin.ts';
import { tokenAllows } from '../apps/api/src/lib/tokenPolicy.ts';

describe('platform admin allowlist', () => {
  test('includes Neville by default', () => {
    expect(isPlatformAdminEmail(BUILTIN_PLATFORM_ADMIN_EMAIL, '', 'production')).toBe(true);
    expect(isPlatformAdminEmail('Neville@Scope.com.mt', '', 'production')).toBe(true);
    expect(platformAdminEmails('', 'production').has(BUILTIN_PLATFORM_ADMIN_EMAIL)).toBe(true);
  });

  test('allows the local seed owner only outside production', () => {
    expect(isPlatformAdminEmail(LOCAL_TEST_PLATFORM_ADMIN_EMAIL, '', 'development')).toBe(true);
    expect(isPlatformAdminEmail(LOCAL_TEST_PLATFORM_ADMIN_EMAIL, '', 'production')).toBe(false);
  });

  test('rejects other emails', () => {
    expect(isPlatformAdminEmail('qa.ts.owner@borntask.com', '', 'development')).toBe(false);
    expect(isPlatformAdminEmail('', '', 'development')).toBe(false);
  });

  test('adds extras from env', () => {
    expect(isPlatformAdminEmail('help@borntask.com', 'help@borntask.com', 'production')).toBe(true);
    expect(isPlatformAdminEmail(BUILTIN_PLATFORM_ADMIN_EMAIL, 'help@borntask.com', 'production')).toBe(true);
  });
});

describe('platform routes stay off personal tokens', () => {
  test('GET /platform/workspaces is denied', () => {
    expect(tokenAllows('GET', '/platform/workspaces', 'read')).toEqual({
      ok: false,
      message: 'This token cannot read that.',
    });
    expect(tokenAllows('GET', '/platform/workspaces', 'read_write')).toEqual({
      ok: false,
      message: 'This token cannot read that.',
    });
  });
});
