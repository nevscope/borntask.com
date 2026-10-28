export function replyMailbox(domain = 'notify.borntask.com'): string {
  return domain.replace(/^@/, '');
}

/** SendGrid Inbound Parse `envelope` is JSON: { to: string[], from: string }. */
export function parseSendGridEnvelope(raw: string): { to: string; from: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as { to?: unknown; from?: unknown };
    const to = Array.isArray(parsed.to) ? String(parsed.to[0] ?? '') : typeof parsed.to === 'string' ? parsed.to : '';
    const from = typeof parsed.from === 'string' ? parsed.from : '';
    if (!to && !from) return null;
    return { to, from };
  } catch {
    return null;
  }
}

export function inboundPlainFromParts(text: string, html: string): string {
  if (text.trim()) return text;
  if (html.trim()) return htmlToPlain(html);
  return '';
}

/** Production must set SENDGRID_INBOUND_SECRET. Local/dev may leave it empty. */
export function inboundSecretRequired(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

/** Returns the secret to check, or null when optional and unset. */
export function resolveInboundSecret(secret: string | undefined, nodeEnv: string | undefined): string | null | 'missing' {
  const expected = secret?.trim() || '';
  if (expected) return expected;
  if (inboundSecretRequired(nodeEnv)) return 'missing';
  return null;
}

export function parseReplyAddress(raw: string, domain = 'notify.borntask.com'): string | null {
  const match = /reply\+([a-zA-Z0-9._-]+)@/i.exec(raw);
  if (!match) return null;
  const host = raw.slice(raw.lastIndexOf('@') + 1).replace(/>$/, '').trim().toLowerCase();
  if (host && host !== domain.toLowerCase()) return null;
  return match[1] ?? null;
}

export function htmlToPlain(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|div|h[1-6]|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Replies whose parent is gone (soft-deleted) show as top-level. */
export function commentParentForClient(
  comments: { id: string; parentId?: string | null }[],
  comment: { parentId?: string | null },
): string | null {
  const parentId = comment.parentId ?? null;
  if (!parentId) return null;
  return comments.some((row) => row.id === parentId) ? parentId : null;
}

export function skipWatcherBecauseMentioned(mentionedIds: string[], watcherId: string): boolean {
  return mentionedIds.includes(watcherId);
}

/** Drop quoted history so a reply becomes a standalone comment. */
export function inboundCommentBody(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.findIndex((line) =>
    /^on .+wrote:$/i.test(line.trim()) ||
    /^[-_]{2,}\s*original message/i.test(line.trim()) ||
    /^from:\s+/i.test(line.trim()),
  );
  const kept = (cut === -1 ? lines : lines.slice(0, cut))
    .filter((line) => !line.startsWith('>'))
    .join('\n')
    .trim();
  return kept.slice(0, 8000);
}
