import { describe, expect, test } from 'vitest';
import { classifyMatch, collapseSearchRows, matchForCollapsed } from '../apps/api/src/lib/searchHits.ts';

describe('search hits', () => {
  test('classifies assignee after title, description and comments', () => {
    expect(classifyMatch('luke', {
      title: 'Checkout',
      description: null,
      assigneeName: 'Luke Camilleri',
      comments: [],
    })).toEqual({ matchField: 'assignee', matchSnippet: 'Luke Camilleri', commentAuthor: null });
  });

  test('collapses a subtask onto its parent and prefers the parent match', () => {
    const parent = { id: 'p', parentId: null, parent: null, title: 'Pay' };
    const child = { id: 'c', parentId: 'p', parent, title: 'Apple Pay' };
    const collapsed = collapseSearchRows([child, parent]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.display.id).toBe('p');
    expect(collapsed[0]?.source.id).toBe('p');
  });

  test('labels a child-only title hit as a subtask', () => {
    const parent = {
      id: 'p',
      title: 'Checkout bug',
      description: null,
      assigneeName: null,
      comments: [],
    };
    const child = {
      id: 'c',
      title: 'Reproduce on BrowserStack',
      description: null,
      assigneeName: null,
      comments: [],
    };
    expect(matchForCollapsed('browserstack', parent, child)).toEqual({
      matchField: 'subtask',
      matchSnippet: 'Reproduce on BrowserStack',
      commentAuthor: null,
    });
  });
});
