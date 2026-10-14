type InviteRole = 'admin' | 'member' | 'guest' | 'viewer';

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export function normaliseDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

/** Domains that count as teammates: the workspace list plus the inviter's own domain. */
export function internalDomains(allowed: unknown, actorEmail: string): string[] {
  const listed = Array.isArray(allowed)
    ? allowed.filter((d): d is string => typeof d === 'string').map(normaliseDomain)
    : [];
  const own = emailDomain(actorEmail);
  return [...new Set([...listed, own].filter((d) => d.includes('.')))];
}

/** An address outside the workspace domains is always a guest. */
export function roleForInvite(email: string, requested: InviteRole, domains: string[]): InviteRole {
  if (domains.includes(emailDomain(email))) return requested;
  return 'guest';
}
