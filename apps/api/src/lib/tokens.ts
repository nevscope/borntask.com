import { createHash, randomBytes } from 'node:crypto';

export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'workspace';
}

export function projectKeyFromName(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (letters.length >= 3) return letters.slice(0, 4);
  return (letters + 'PROJ').slice(0, 4);
}
