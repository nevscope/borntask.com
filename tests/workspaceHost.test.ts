import { describe, expect, test } from 'vitest';
import {
  appOrigin,
  inferAppBaseDomain,
  isAllowedWebOrigin,
  isReservedWorkspaceSlug,
  workspaceOrigin,
  workspaceSlugFromHost,
} from '../packages/shared/src/workspaceHost.ts';

describe('workspace host', () => {
  test('reads a workspace slug from the hostname', () => {
    expect(workspaceSlugFromHost('acme.borntask.com', 'borntask.com')).toBe('acme');
    expect(workspaceSlugFromHost('app.borntask.com', 'borntask.com')).toBeNull();
    expect(workspaceSlugFromHost('www.borntask.com', 'borntask.com')).toBeNull();
    expect(workspaceSlugFromHost('borntask.com', 'borntask.com')).toBeNull();
    expect(workspaceSlugFromHost('mail.borntask.com', 'borntask.com')).toBeNull();
    expect(workspaceSlugFromHost('foo.bar.borntask.com', 'borntask.com')).toBeNull();
    expect(workspaceSlugFromHost('localhost', 'borntask.com')).toBeNull();
  });

  test('reserves product hostnames', () => {
    expect(isReservedWorkspaceSlug('app')).toBe(true);
    expect(isReservedWorkspaceSlug('notify')).toBe(true);
    expect(isReservedWorkspaceSlug('acme')).toBe(false);
  });

  test('infers the base domain from PUBLIC_URL', () => {
    expect(inferAppBaseDomain('https://app.borntask.com')).toBe('borntask.com');
    expect(inferAppBaseDomain('http://localhost:5174')).toBeNull();
  });

  test('builds workspace and hub origins', () => {
    expect(workspaceOrigin('acme', { baseDomain: 'borntask.com' })).toBe('https://acme.borntask.com');
    expect(appOrigin({ baseDomain: 'borntask.com', publicUrl: 'https://app.borntask.com' })).toBe('https://app.borntask.com');
    expect(appOrigin({ baseDomain: null, publicUrl: 'http://localhost:5174' })).toBe('http://localhost:5174');
  });

  test('allows CORS for workspace hosts on the base domain', () => {
    const opts = { publicUrl: 'https://app.borntask.com', baseDomain: 'borntask.com' };
    expect(isAllowedWebOrigin('https://acme.borntask.com', opts)).toBe(true);
    expect(isAllowedWebOrigin('https://app.borntask.com', opts)).toBe(true);
    expect(isAllowedWebOrigin('https://evil.example', opts)).toBe(false);
    expect(isAllowedWebOrigin('http://acme.borntask.com', opts)).toBe(false);
    expect(isAllowedWebOrigin('http://localhost:5174', opts)).toBe(true);
  });
});
