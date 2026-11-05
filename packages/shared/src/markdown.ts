/** Turn CommonMark-ish MCP text into description HTML. No extra libraries. */

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

function safeHref(href: string): string {
  const t = href.trim();
  if (/^(https?:|mailto:)/i.test(t)) return t;
  if (t.startsWith('/') && !t.startsWith('//')) return t;
  return '';
}

function inline(value: string): string {
  let text = escapeText(value);
  text = text.replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
    const safe = safeHref(href);
    return safe
      ? `<a href="${escapeAttr(safe)}" rel="noopener noreferrer" target="_blank">${label}</a>`
      : label;
  });
  return text;
}

function isTableRow(line: string): boolean {
  return /^\s*\|.+\|\s*$/.test(line);
}

function isTableRule(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function tableHtml(rows: string[]): string {
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
  const body = rows.filter((row, i) => i === 0 || !isTableRule(row));
  if (!body.length) return '';
  const head = cells(body[0]!);
  const rest = body.slice(1);
  const thead = `<thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = rest.length
    ? `<tbody>${rest.map((row) => `<tr>${cells(row).map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`
    : '';
  return `<table>${thead}${tbody}</table>`;
}

export function looksLikeMarkdown(value: string): boolean {
  if (!value.trim()) return false;
  return /(?:^|\n)\s{0,3}#{1,6}\s+\S|(?:^|\n)\s{0,3}(?:[-*+]|\d+\.)\s+\S|(?:^|\n)\s*\|.+\||(?:^|\n)```|\*\*[^*]+\*\*|__[^_]+__|(?:^|[^*])\*[^*]+\*/.test(value);
}

export function markdownToHtml(value: string): string {
  const src = value.replace(/\r\n/g, '\n').trim();
  if (!src) return '';
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const fence: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        fence.push(escapeText(lines[i]!));
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(`<pre><code>${fence.join('\n')}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const n = heading[1]!.length;
      out.push(`<h${n}>${inline(heading[2]!)}</h${n}>`);
      i += 1;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1]!)) {
      const rows = [line];
      i += 1;
      while (i < lines.length && isTableRow(lines[i]!)) {
        rows.push(lines[i]!);
        i += 1;
      }
      out.push(tableHtml(rows));
      continue;
    }
    if (/^\s{0,3}[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s{0,3}[-*+]\s+/.test(lines[i]!)) {
        items.push(`<li>${inline(lines[i]!.replace(/^\s{0,3}[-*+]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\s{0,3}\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s{0,3}\d+\.\s+/.test(lines[i]!)) {
        items.push(`<li>${inline(lines[i]!.replace(/^\s{0,3}\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i]!.trim() && !/^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|```|\|)/.test(lines[i]!)) {
      para.push(lines[i]!);
      i += 1;
    }
    out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('');
}
