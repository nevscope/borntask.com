import { describe, expect, test } from 'vitest';
import { presentNotification, textFor } from '../apps/api/src/lib/presentNotification.ts';

const actor = { id: 'u1', name: 'Hannah Cole', email: 'hannah@example.com' };
const task = { number: 86, title: 'Columns menu', project: { key: 'BOR' } };

function row(patch: Partial<Parameters<typeof presentNotification>[0]>): Parameters<typeof presentNotification>[0] {
  return {
    id: 'n1',
    kind: 'moved',
    readAt: null,
    createdAt: new Date('2026-11-06T08:00:00Z'),
    actor,
    task,
    ...patch,
  };
}

describe('presentNotification', () => {
  test('keeps digest_sent out of the inbox', () => {
    expect(presentNotification(row({ kind: 'digest_sent', task: null, actor: null }))).toBeNull();
  });

  test('drops stage changes with no task key or title', () => {
    expect(presentNotification(row({ task: null, actor: null }))).toBeNull();
  });

  test('fills key, title and actor on a stage change', () => {
    const note = presentNotification(row({}));
    expect(note?.kind).toBe('moved');
    expect(note?.taskKey).toBe('BOR-86');
    expect(note?.text).toBe('Hannah Cole moved BOR-86: Columns menu');
  });

  test('uses BornTask only when a move has no actor', () => {
    expect(textFor('moved', 'Columns menu', 'BOR-86', null)).toBe('BornTask moved BOR-86: Columns menu');
  });
});
