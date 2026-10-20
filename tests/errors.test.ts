import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { ApiError, humanizeZodIssues, sendError } from '../apps/api/src/errors.ts';

function reply() {
  const rec: { statusCode?: number; body?: unknown } = {};
  const self = {
    status(code: number) {
      rec.statusCode = code;
      return self;
    },
    send(body: unknown) {
      rec.body = body;
      return self;
    },
  };
  return { rec, self };
}

describe('sendError validation messages', () => {
  test('turns a Zod too_big name into a readable sentence', () => {
    const parsed = z.object({ name: z.string().max(80) }).safeParse({ name: 'x'.repeat(90) });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const { rec, self } = reply();
    sendError(self as never, parsed.error);
    expect(rec.statusCode).toBe(400);
    expect(rec.body).toEqual({
      code: 'VALIDATION',
      message: 'Name must be 80 characters or fewer.',
    });
  });

  test('does not leak a Zod JSON dump when instanceof fails', () => {
    const parsed = z.object({ name: z.string().max(80) }).safeParse({ name: 'x'.repeat(90) });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const dumped = new Error(parsed.error.message);
    const { rec, self } = reply();
    sendError(self as never, dumped);
    expect(rec.statusCode).toBe(400);
    expect((rec.body as { message: string }).message).toBe('Name must be 80 characters or fewer.');
    expect((rec.body as { message: string }).message.startsWith('[')).toBe(false);
  });

  test('uses custom schema copy when present', () => {
    const issues = z
      .object({ name: z.string().max(80, 'Display name must be 80 characters or fewer.') })
      .safeParse({ name: 'x'.repeat(81) });
    expect(issues.success).toBe(false);
    if (issues.success) return;
    expect(humanizeZodIssues(issues.error.issues)).toBe('Display name must be 80 characters or fewer.');
  });

  test('still sends ApiError copy', () => {
    const { rec, self } = reply();
    sendError(self as never, new ApiError(400, 'VALIDATION', 'Enter a display name.'));
    expect(rec).toEqual({ statusCode: 400, body: { code: 'VALIDATION', message: 'Enter a display name.' } });
  });
});
