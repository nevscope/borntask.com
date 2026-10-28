import { describe, expect, test } from 'vitest';
import { digestSecret, hashesMatch, normalizeEmail, renderLoginCodeMail } from '../apps/api/src/lib/emailLogin.ts';

describe('email login helpers', () => {
  test('normalises a valid address', () => {
    expect(normalizeEmail(' Maya@Example.COM ')).toBe('maya@example.com');
  });

  test('rejects incomplete or messy addresses', () => {
    for (const bad of ['', 'maya', 'a@b', 'a@@b.com', 'a b@c.com', 'a@.com']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  test('HMAC digest is keyed and compared in constant time', () => {
    const a = digestSecret('code', '123456', 'secret-a');
    const b = digestSecret('code', '123456', 'secret-b');
    expect(a).not.toBe(b);
    expect(hashesMatch(a, digestSecret('code', '123456', 'secret-a'))).toBe(true);
    expect(hashesMatch(a, digestSecret('code', '000000', 'secret-a'))).toBe(false);
  });

  test('sign-in email copy uses a hyphen and includes the code and link', () => {
    const { subject, text, html } = renderLoginCodeMail('123456', 'https://app.borntask.com/sign-in/email?token=t');
    expect(subject).toBe('123456 is your BornTask sign-in code');
    expect(text).toContain('https://app.borntask.com/sign-in/email?token=t');
    for (const blob of [subject, text, html]) {
      expect(blob).not.toContain('\u2014');
      expect(blob).not.toContain('\u2013');
    }
  });
});
