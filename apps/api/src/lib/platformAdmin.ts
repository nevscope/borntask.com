import { normalizeEmail } from './emailLogin.js';

export const BUILTIN_PLATFORM_ADMIN_EMAIL = 'neville@scope.com.mt';
/** Local seed owner. Allowed only when NODE_ENV is not production. */
export const LOCAL_TEST_PLATFORM_ADMIN_EMAIL = 'owner@borntask.com';

export function platformAdminEmails(
  extraEnv = process.env.PLATFORM_ADMIN_EMAILS,
  nodeEnv = process.env.NODE_ENV,
): Set<string> {
  const extras = (extraEnv ?? '')
    .split(',')
    .map((part) => normalizeEmail(part))
    .filter((email): email is string => Boolean(email));
  const emails = new Set([BUILTIN_PLATFORM_ADMIN_EMAIL, ...extras]);
  if (nodeEnv !== 'production') emails.add(LOCAL_TEST_PLATFORM_ADMIN_EMAIL);
  return emails;
}

export function isPlatformAdminEmail(
  email: string | null | undefined,
  extraEnv = process.env.PLATFORM_ADMIN_EMAILS,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  const normalised = normalizeEmail(email ?? '');
  if (!normalised) return false;
  return platformAdminEmails(extraEnv, nodeEnv).has(normalised);
}
