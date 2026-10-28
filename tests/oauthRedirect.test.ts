import { describe, expect, test } from 'vitest';
import { safeRedirect } from '../apps/api/src/lib/oauthRedirect.ts';

describe('OAuth return addresses', () => {
  test('allows https, loopback and Cursor desktop callbacks', () => {
    expect(safeRedirect('https://www.cursor.com/agents/mcp/oauth/callback').href).toContain('cursor.com');
    expect(safeRedirect('http://localhost:8787/callback').hostname).toBe('localhost');
    expect(safeRedirect('http://127.0.0.1:8787/callback').hostname).toBe('127.0.0.1');
    expect(safeRedirect('cursor://anysphere.cursor-mcp/oauth/callback').protocol).toBe('cursor:');
    expect(safeRedirect('claude://claude.ai/mcp-auth-callback/sdk').hostname).toBe('claude.ai');
  });

  test('rejects other schemes and non-local http', () => {
    expect(() => safeRedirect('http://evil.example/callback')).toThrow(/https, localhost/);
    expect(() => safeRedirect('ftp://localhost/x')).toThrow(/https, localhost/);
    expect(() => safeRedirect('not a url')).toThrow(/not a valid URL/);
  });
});
