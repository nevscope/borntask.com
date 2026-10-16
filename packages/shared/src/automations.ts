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
  { onStatusSlug: 'ready_for_testing', action: 'assign_role', roleSlug: 'tester', enabled: false },
  { onStatusSlug: 'deployed', action: 'notify_role', roleSlug: 'business', enabled: false },
];

export function mergeDefaultAutomations(rows: AutomationRule[]): AutomationRule[] {
  const keyed = new Map(rows.map((row) => [`${row.onStatusSlug}:${row.action}`, row] as const));
  const out = DEFAULT_AUTOMATION_TEMPLATES.map(
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
