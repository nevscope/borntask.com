import { describe, expect, test } from 'vitest';
import { tokenAllows } from '../apps/api/src/lib/tokenPolicy.ts';

describe('token allow list', () => {
  test('lets a personal token download a task attachment', () => {
    expect(tokenAllows('GET', '/tasks/BOR-19/attachments/cmvsar2ou008kqb01sd374rrb', 'read')).toEqual({ ok: true });
    expect(tokenAllows('GET', '/tasks/BOR-19/attachments/cmvsar2ou008kqb01sd374rrb?download=1', 'read_write')).toEqual({ ok: true });
  });

  test('still blocks attachment deletes and other reads', () => {
    expect(tokenAllows('DELETE', '/tasks/BOR-19/attachments/cmvsar2ou008kqb01sd374rrb', 'read_write')).toEqual({
      ok: false,
      message: 'Personal tokens and MCP cannot delete tasks.',
    });
    expect(tokenAllows('GET', '/admin/types', 'read')).toEqual({
      ok: false,
      message: 'This token cannot read that.',
    });
  });
});
