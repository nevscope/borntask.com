import { describe, expect, it } from 'vitest';
import { looksLikeMarkdown, markdownToHtml } from '../packages/shared/src/markdown.ts';

describe('markdownToHtml', () => {
  it('keeps headings, bold, lists and tables', () => {
    const html = markdownToHtml(`# Title

A **bold** and *italic* line.

- one
- two

| Col | Other |
| --- | --- |
| a | b |
`);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<th>Col</th>');
    expect(html).toContain('<td>a</td>');
  });

  it('recognises typical MCP descriptions', () => {
    expect(looksLikeMarkdown('- fix the list')).toBe(true);
    expect(looksLikeMarkdown('plain sentence')).toBe(false);
  });
});
