import { describe, expect, test } from 'vitest';
import { readableDescriptionHtml, sanitizeDescriptionHtml } from '../apps/web/src/lib/descriptionHtml.ts';

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
});
