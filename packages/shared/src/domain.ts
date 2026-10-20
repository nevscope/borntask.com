import { z } from 'zod';

export const tenantRoleSchema = z.enum(['owner', 'admin', 'member', 'guest', 'viewer']);
export const prioritySchema = z.enum(['urgent', 'high', 'medium', 'low', 'none']);
export const activityViaSchema = z.enum(['app', 'mcp', 'github', 'import', 'automation']);
export const bugsStartInSchema = z.enum(['approved', 'idea']);

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('borntask-api'),
  database: z.enum(['ok', 'unavailable']),
});

export type Health = z.infer<typeof healthSchema>;

/** MySQL TEXT is 65,535 bytes. Descriptions are stored as HTML. */
export const MAX_TASK_DESCRIPTION_BYTES = 65_535;
export const TASK_DESCRIPTION_TOO_LONG = 'Description is too long. Shorten it to save.';

export function taskDescriptionByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function isTaskDescriptionTooLong(value: string): boolean {
  return taskDescriptionByteLength(value) > MAX_TASK_DESCRIPTION_BYTES;
}

export const taskDescriptionSchema = z.string().superRefine((value, ctx) => {
  if (isTaskDescriptionTooLong(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: TASK_DESCRIPTION_TOO_LONG });
  }
});
