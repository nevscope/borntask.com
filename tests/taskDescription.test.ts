import { describe, expect, test } from 'vitest';
import {
  isTaskDescriptionTooLong,
  MAX_TASK_DESCRIPTION_BYTES,
  TASK_DESCRIPTION_TOO_LONG,
  taskDescriptionSchema,
} from '../packages/shared/src/domain.ts';

describe('task description length', () => {
  test('accepts a normal description', () => {
    expect(isTaskDescriptionTooLong('<p>Checkout fails on Safari</p>')).toBe(false);
    expect(taskDescriptionSchema.safeParse('<p>Checkout fails on Safari</p>').success).toBe(true);
  });

  test('rejects HTML over the MySQL TEXT byte limit', () => {
    const tooLong = 'a'.repeat(MAX_TASK_DESCRIPTION_BYTES + 1);
    expect(isTaskDescriptionTooLong(tooLong)).toBe(true);
    const parsed = taskDescriptionSchema.safeParse(tooLong);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe(TASK_DESCRIPTION_TOO_LONG);
  });
});
