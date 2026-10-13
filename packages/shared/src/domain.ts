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
