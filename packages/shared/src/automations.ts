import { z } from 'zod';

export const AUTOMATION_ACTIONS = ['assign_role', 'notify_role'] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

export const automationRuleSchema = z.object({
  onStatusSlug: z.string().trim().min(1).max(64),
  action: z.enum(AUTOMATION_ACTIONS),
  roleSlug: z.string().trim().min(1).max(40),
  enabled: z.boolean(),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;

export const DEFAULT_AUTOMATION_TEMPLATES: AutomationRule[] = [
  { onStatusSlug: 'ready_for_testing', action: 'assign_role', roleSlug: 'tester', enabled: true },
  { onStatusSlug: 'deployed', action: 'notify_role', roleSlug: 'business', enabled: false },
];

/** Pick default rules that match this project's statuses (Delivery vs Simple). */
export function defaultAutomationsForStatuses(statusSlugs: string[]): AutomationRule[] {
  const slugs = new Set(statusSlugs);
  const assignOn = slugs.has('ready_for_testing')
    ? 'ready_for_testing'
    : slugs.has('testing')
      ? 'testing'
      : slugs.has('doing')
        ? 'doing'
        : null;
  const notifyOn = slugs.has('deployed') ? 'deployed' : slugs.has('done') ? 'done' : null;
  const out: AutomationRule[] = [];
  if (assignOn) {
    out.push({
      onStatusSlug: assignOn,
      action: 'assign_role',
      roleSlug: assignOn === 'doing' ? 'developer' : 'tester',
      enabled: assignOn !== 'doing',
    });
  }
  if (notifyOn) {
    out.push({
      onStatusSlug: notifyOn,
      action: 'notify_role',
      roleSlug: 'business',
      enabled: false,
    });
  }
  return out.length ? out : DEFAULT_AUTOMATION_TEMPLATES;
}

export function noAssigneeActivity(roleSlug: string): string {
  return roleSlug === 'tester' ? 'no tester to assign' : `no ${roleSlug} to assign`;
}

export function mergeDefaultAutomations(rows: AutomationRule[], statusSlugs?: string[]): AutomationRule[] {
  const templates = statusSlugs?.length ? defaultAutomationsForStatuses(statusSlugs) : DEFAULT_AUTOMATION_TEMPLATES;
  const keyed = new Map(rows.map((row) => [`${row.onStatusSlug}:${row.action}`, row] as const));
  const out = templates.map(
    (template) => keyed.get(`${template.onStatusSlug}:${template.action}`) ?? template,
  );
  for (const row of rows) {
    const isTemplate = DEFAULT_AUTOMATION_TEMPLATES.some(
      (template) => template.onStatusSlug === row.onStatusSlug && template.action === row.action,
    );
    if (!isTemplate) out.push(row);
  }
  return out;
}

export type RoleMember = { userId: string; roleSlugs: string[]; isLead: boolean };

/** If several people have the role, prefer the project lead when they also have it. */
export function pickAssigneeForRole(members: RoleMember[], roleSlug: string): string | null {
  const withRole = members.filter((member) => member.roleSlugs.includes(roleSlug));
  if (!withRole.length) return null;
  const lead = withRole.find((member) => member.isLead || member.roleSlugs.includes('lead'));
  return lead?.userId ?? withRole[0]?.userId ?? null;
}
