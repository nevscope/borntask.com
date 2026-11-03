import { describe, expect, test } from 'vitest';
import { sanitizeDescriptionHtml as sanitizeOnSave } from '../apps/api/src/lib/descriptionHtml.ts';
import { discardEditorHtmlOnBlur, isEmptyDescription, persistDescription, readableDescriptionHtml, sanitizeDescriptionHtml } from '../apps/web/src/lib/descriptionHtml.ts';

const people = [
  { id: 'u1', name: 'Vicky Saliba' },
  { id: 'u2', name: 'Neville Micallef' },
];

describe('readable description and comments', () => {
  test('turns a mention span into a search link', () => {
    const html = readableDescriptionHtml(
      '<p><span data-type="mention" data-id="u1" data-label="Vicky Saliba">@Vicky Saliba</span></p>',
      people,
    );
    expect(html).toContain('href="/search?q=Vicky%20Saliba"');
    expect(html).toContain('class="bt-mention"');
    expect(html).toContain('@Vicky Saliba');
  });

  test('linkifies a typed @name and a raw URL', () => {
    const html = readableDescriptionHtml('<p>@Vicky Saliba see https://example.com/docs.</p>', people);
    expect(html).toContain('href="/search?q=Vicky%20Saliba"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
  });

  test('keeps mention class on persist', () => {
    const html = sanitizeDescriptionHtml('<span data-type="mention" data-id="u1" data-label="Vicky Saliba">@Vicky Saliba</span>');
    expect(html).toContain('class="bt-mention"');
    expect(html).toContain('data-type="mention"');
  });

  test('keeps an edit when the parent value has not caught up', () => {
    expect(discardEditorHtmlOnBlur('', '', '<p>Added on the way out</p>')).toBe(false);
  });

  test('drops editor HTML after the parent has cleared a sent comment', () => {
    expect(discardEditorHtmlOnBlur('', '<p>Sent</p>', '<p>Sent</p>')).toBe(true);
  });

  test('keeps a task image and drops an outside image', () => {
    const html = sanitizeDescriptionHtml('<p><img src="/api/tasks/BOR-38/attachments/abc123" alt="Shot" data-attachment-id="abc123"><img src="https://evil.test/x.png" onerror="alert(1)"></p>');
    expect(html).toContain('src="/api/tasks/BOR-38/attachments/abc123"');
    expect(html).toContain('data-attachment-id="abc123"');
    expect(html).not.toContain('evil');
    expect(html).not.toContain('onerror');
  });

  test('keeps a pasted table and drops a script inside it', () => {
    const html = sanitizeDescriptionHtml('<table><tbody><tr><th colspan="2">A</th></tr><tr><td>B</td><td><script>alert(1)</script>C</td></tr></tbody></table>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th colspan="2">');
    expect(html).toContain('<td>C</td>');
    expect(html).not.toContain('script');
  });

  test('an image on its own is a comment', () => {
    const html = '<img src="/api/tasks/BOR-38/attachments/abc123" alt="Shot" data-attachment-id="abc123">';
    expect(isEmptyDescription(html)).toBe(false);
    expect(persistDescription(html)).toContain('data-attachment-id="abc123"');
    expect(sanitizeOnSave(html)).toBe(persistDescription(html));
  });
});
