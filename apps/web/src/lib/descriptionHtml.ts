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
      const href = attr(full, 'href');
      const safe = safeHref(href);
      return safe ? `<a href="${escapeAttr(safe)}" rel="noopener noreferrer" target="_blank">` : '<a>';
    }
    if (name === 'span') {
      const type = attr(full, 'data-type');
      const id = attr(full, 'data-id');
      const label = attr(full, 'data-label');
      if (type === 'mention') {
        const bits = ['<span data-type="mention"'];
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
