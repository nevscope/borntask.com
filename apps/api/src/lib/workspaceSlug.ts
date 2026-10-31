import { isReservedWorkspaceSlug } from '@borntask/shared';
import { validation } from '../errors.js';
import { slugify } from './tokens.js';

export function parseWorkspaceSlug(raw: string): string {
  const slug = slugify(raw);
  if (slug.length < 2) throw validation('Choose a longer web address.');
  if (isReservedWorkspaceSlug(slug)) throw validation('That web address is reserved.');
  return slug;
}
