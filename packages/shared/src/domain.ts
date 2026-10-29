import { z } from 'zod';

export const tenantRoleSchema = z.enum(['owner', 'admin', 'member', 'guest', 'viewer']);
export const prioritySchema = z.enum(['urgent', 'high', 'medium', 'low', 'none']);
export const activityViaSchema = z.enum(['app', 'mcp', 'github', 'import', 'automation']);
export const bugsStartInSchema = z.enum(['approved', 'idea']);
export const workBreakdownSchema = z.enum(['off', 'stories', 'epics_stories']);
export type WorkBreakdown = z.infer<typeof workBreakdownSchema>;

export const PLANNING_TYPE_SLUGS = ['story', 'epic'] as const;
export type PlanningTypeSlug = (typeof PLANNING_TYPE_SLUGS)[number];

export const PLANNING_TYPES = [
  { slug: 'story', name: 'Story', colour: '#0F4C6A', template: '## Outcome\n\n## In scope\n\n- \n' },
  { slug: 'epic', name: 'Epic', colour: '#6B3D7A', template: '## Goal\n\n## Why now\n' },
] as const;

export function isPlanningType(slug: string): slug is PlanningTypeSlug {
  return slug === 'story' || slug === 'epic';
}

export function planningTypeAllowed(breakdown: WorkBreakdown | string | null | undefined, slug: string): boolean {
  if (slug === 'epic') return breakdown === 'epics_stories';
  if (slug === 'story') return breakdown === 'stories' || breakdown === 'epics_stories';
  return true;
}

/** Parent must be a Story, or an Epic when the project uses epics. */
export function planningParentAllowed(
  breakdown: WorkBreakdown | string | null | undefined,
  childSlug: string,
  parentSlug: string | null,
): boolean {
  if (!parentSlug) return true;
  if (breakdown === 'off' || !breakdown) return false;
  if (childSlug === 'epic') return false;
  if (childSlug === 'story') return breakdown === 'epics_stories' && parentSlug === 'epic';
  if (parentSlug === 'story') return breakdown === 'stories' || breakdown === 'epics_stories';
  if (parentSlug === 'epic') return breakdown === 'epics_stories';
  return false;
}

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

/** Same start stage as create-task. Bugs follow Workspace.bugsStartIn (default Approved). Stories and epics follow the project setting. */
export function createTaskStartSlug(
  type: string,
  bugsStartIn?: string | null,
  storiesNeedApproval?: boolean | null,
): string {
  if (type === 'bug') return bugsStartIn === 'idea' ? 'idea' : 'approved';
  if ((type === 'story' || type === 'epic') && storiesNeedApproval === false) return 'approved';
  return 'idea';
}

export const taskDescriptionSchema = z.string().superRefine((value, ctx) => {
  if (isTaskDescriptionTooLong(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: TASK_DESCRIPTION_TOO_LONG });
  }
});
