/** Description HTML: detect, sanitise (no scripts), and flatten for search. */

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'code', 'pre', 'a', 'span']);

export function looksLikeHtml(value: string): boolean {
  return /<(?:p|br|div|ul|ol|li|strong|em|b|i|code|pre|a|h[1-6]|span)\b/i.test(value);
}

export function stripTags(value: string): string {
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

export function normalizePlain(value: string): string {
  const plain = looksLikeHtml(value) ? stripTags(value) : value;
  return plain.replace(/\s+/g, ' ').trim();
}

export function isEmptyDescription(value: string): boolean {
  return !normalizePlain(value);
}

export function isSameAsTemplate(value: string, template: string): boolean {
  return normalizePlain(value) === normalizePlain(template);
}

/** Template text with no formatting yet - type switch may replace it. */
export function isUntouchedTemplate(value: string, template: string): boolean {
  if (normalizePlain(value) !== normalizePlain(template)) return false;
  if (!looksLikeHtml(value)) return true;
  return !/<(?:strong|b|em|i|ul|ol|li|code|pre|a|span)\b/i.test(value);
}

export function textToHtml(text: string): string {
  if (!text.trim()) return '';
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeText(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function toEditorHtml(value: string): string {
  if (!value.trim()) return '';
  return looksLikeHtml(value) ? sanitizeDescriptionHtml(value) : textToHtml(value);
}

export function persistDescription(value: string): string {
  if (isEmptyDescription(value)) return '';
  return looksLikeHtml(value) ? sanitizeDescriptionHtml(value) : value;
}

export function sanitizeDescriptionHtml(html: string): string {
  if (!html.trim()) return '';
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return stripped.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (full, tag: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED.has(name)) return '';
    if (name === 'br') return '<br>';
    if (full.startsWith('</')) return `</${name}>`;
    if (name === 'a') {
      const type = attr(full, 'data-type');
      if (type === 'mention') return mentionOpenTag(attr(full, 'data-id'), attr(full, 'data-label'));
      const href = attr(full, 'href');
      const safe = safeHref(href);
      return safe ? `<a href="${escapeAttr(safe)}" rel="noopener noreferrer" target="_blank">` : '<a>';
    }
    if (name === 'span') {
      const type = attr(full, 'data-type');
      const id = attr(full, 'data-id');
      const label = attr(full, 'data-label');
      if (type === 'mention') {
        const bits = ['<span class="bt-mention" data-type="mention"'];
        if (id) bits.push(` data-id="${escapeAttr(id)}"`);
        if (label) bits.push(` data-label="${escapeAttr(label)}"`);
        bits.push('>');
        return bits.join('');
      }
      return '<span>';
    }
    return `<${name}>`;
  });
}

export function mentionSearchHref(label: string): string {
  return `/search?q=${encodeURIComponent(label)}`;
}

function mentionOpenTag(id: string, label: string): string {
  const name = label || id;
  const bits = [`<a href="${escapeAttr(mentionSearchHref(name))}" class="bt-mention" data-type="mention"`];
  if (id) bits.push(` data-id="${escapeAttr(id)}"`);
  if (label) bits.push(` data-label="${escapeAttr(label)}"`);
  bits.push('>');
  return bits.join('');
}

/** Display-only: turn raw URLs and @Name into links. Persist still uses sanitizeDescriptionHtml. */
export function readableDescriptionHtml(value: string, people: { id: string; name: string }[] = []): string {
  const html = toEditorHtml(value);
  if (!html) return '';
  return linkifyPlainUrls(linkifyAtNames(mentionsToLinks(html), people));
}

function mentionsToLinks(html: string): string {
  return html.replace(/<span([^>]*data-type=["']mention["'][^>]*)>([\s\S]*?)<\/span>/gi, (_all, rawAttrs: string, inner: string) => {
    const attrs = `<span${rawAttrs}>`;
    return `${mentionOpenTag(attr(attrs, 'data-id'), attr(attrs, 'data-label'))}${inner}</a>`;
  });
}

function mapTextOutsideLinks(html: string, fn: (text: string) => string): string {
  return html
    .split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi)
    .map((part) => {
      if (/^<a\b/i.test(part)) return part;
      return part.replace(/([^<]+)|(<[^>]+>)/g, (_all, text: string | undefined, tag: string | undefined) => (tag ? tag : fn(text ?? '')));
    })
    .join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function linkifyAtNames(html: string, people: { id: string; name: string }[]): string {
  if (!people.length) return html;
  const names = [...people]
    .flatMap((person) => {
      const first = person.name.split(/\s+/)[0] ?? person.name;
      const firstUnique = people.filter((other) => (other.name.split(/\s+/)[0] ?? '') === first).length === 1;
      return firstUnique && first !== person.name
        ? [{ id: person.id, name: person.name, token: person.name }, { id: person.id, name: person.name, token: first }]
        : [{ id: person.id, name: person.name, token: person.name }];
    })
    .sort((a, b) => b.token.length - a.token.length);
  return mapTextOutsideLinks(html, (text) => {
    let out = text;
    for (const person of names) {
      const re = new RegExp(`@${escapeRegExp(person.token)}(?![\\p{L}\\p{N}])`, 'giu');
      out = out.replace(re, () => `${mentionOpenTag(person.id, person.name)}@${escapeText(person.name)}</a>`);
    }
    return out;
  });
}

function linkifyPlainUrls(html: string): string {
  return mapTextOutsideLinks(html, (text) =>
    text.replace(/\b(https?:\/\/[^\s<]+)/gi, (raw) => {
      const trimmed = raw.replace(/[),.;!?]+$/u, '');
      const tail = raw.slice(trimmed.length);
      const safe = safeHref(trimmed);
      if (!safe) return raw;
      return `<a href="${escapeAttr(safe)}" rel="noopener noreferrer" target="_blank">${escapeText(trimmed)}</a>${tail}`;
    }),
  );
}

function attr(tag: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function safeHref(href: string): string | null {
  const t = href.trim();
  if (/^(https?:|mailto:)/i.test(t)) return t;
  if (t.startsWith('/') && !t.startsWith('//')) return t;
  return null;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
