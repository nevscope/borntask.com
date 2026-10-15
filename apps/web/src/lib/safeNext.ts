/** In-app path only. Rejects protocol-relative and sign-in loops. */
export function safeNext(raw: string | null | undefined): string | undefined {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/sign-in')) return undefined;
  return raw;
}
