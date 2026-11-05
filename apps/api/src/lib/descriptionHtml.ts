/** Description HTML: sanitise on save and flatten for search snippets. */

import { markdownToHtml } from '@borntask/shared';

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'code', 'pre', 'a', 'span', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export function looksLikeHtml(value: string): boolean {
  return /<(?:p|br|div|ul|ol|li|strong|em|b|i|code|pre|a|h[1-6]|span|img|table|thead|tbody|tr|th|td)\b/i.test(value);
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

export function persistDescription(value: string): string {
  if (!value.trim()) return '';
  return looksLikeHtml(value) ? sanitizeDescriptionHtml(value) : sanitizeDescriptionHtml(markdownToHtml(value));
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
    if (name === 'img') return full.startsWith('</') ? '' : imageTag(full);
    if (name === 'th' || name === 'td') {
      if (full.startsWith('</')) return `</${name}>`;
      return `<${name}${spanAttr(full, 'colspan')}${spanAttr(full, 'rowspan')}>`;
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

function mentionSearchHref(label: string): string {
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

function attr(tag: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function spanAttr(tag: string, name: 'colspan' | 'rowspan'): string {
  const n = Number(attr(tag, name));
  return Number.isInteger(n) && n > 1 && n <= 12 ? ` ${name}="${n}"` : '';
}

function imageTag(tag: string): string {
  const src = safeImageSrc(attr(tag, 'src'));
  if (!src) return '';
  const id = safeAttachmentId(attr(tag, 'data-attachment-id'));
  const alt = attr(tag, 'alt').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const bits = [`<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"`];
  if (id) bits.push(` data-attachment-id="${escapeAttr(id)}"`);
  bits.push('>');
  return bits.join('');
}

function safeImageSrc(src: string): string | null {
  const t = src.trim();
  if (/^\/(?:api\/)?tasks\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+$/.test(t)) return t;
  return null;
}

function safeAttachmentId(value: string): string | null {
  const t = value.trim();
  return /^[A-Za-z0-9_-]+$/.test(t) ? t : null;
}

function safeHref(href: string): string | null {
  const t = href.trim();
  if (/^(https?:|mailto:)/i.test(t)) return t;
  if (t.startsWith('/') && !t.startsWith('//')) return t;
  return null;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
