import { Switch } from 'antd';
import { useProject, useProjectAutomations, useSaveProjectAutomations } from '../api/queries';
import type { AutomationRule } from '../api/queries';
import { RoleTag } from './Chips';
import type { ProjectRole } from '../api/types';
import { color } from '../theme/tokens';

const ROLES: ProjectRole[] = ['lead', 'business', 'developer', 'tester', 'observer'];

function statusLabel(slug: string, names: Map<string, string>) {
  return names.get(slug) ?? slug.replace(/_/g, ' ');
}

function actionLabel(action: AutomationRule['action']) {
  return action === 'assign_role' ? 'Assign' : 'Notify';
}

function asRole(slug: string): ProjectRole | null {
  return ROLES.includes(slug as ProjectRole) ? (slug as ProjectRole) : null;
}

export function AutomationsCard({ projectKey }: { projectKey: string }) {
  const project = useProject(projectKey);
  const query = useProjectAutomations(projectKey);
  const save = useSaveProjectAutomations(projectKey);
  const canManage = query.data?.canManage ?? false;
  const names = new Map((project.data?.workflow.statuses ?? []).map((status) => [status.id, status.name]));

  const toggle = (row: AutomationRule, enabled: boolean) => {
    const current = query.data?.automations ?? [];
    const next = current.map((item) =>
      item.onStatusSlug === row.onStatusSlug && item.action === row.action ? { ...item, enabled } : item,
    );
    save.mutate(next);
  };

  return (
    <section className="bt-card">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
        <h2 style={{ flex: '1 1 200px', margin: 0, fontSize: 15, fontWeight: 600 }}>Automations</h2>
        <span style={{ fontSize: 12.5, color: color.muted }}>When a task enters a stage</span>
      </div>
      {(query.data?.automations ?? []).map((row) => {
        const role = asRole(row.roleSlug);
        return (
          <div
            key={`${row.onStatusSlug}:${row.action}`}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1.2fr) 72px minmax(90px, 1fr) 52px', gap: 10, alignItems: 'center', minHeight: 52, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}
          >
            <span style={{ fontSize: 13.5 }}>On {statusLabel(row.onStatusSlug, names)}</span>
            <span style={{ fontSize: 13.5, color: color.ink3 }}>{actionLabel(row.action)}</span>
            <span>{role ? <RoleTag role={role} /> : row.roleSlug}</span>
            <Switch
              size="small"
              checked={row.enabled}
              disabled={!canManage}
              aria-label={`${actionLabel(row.action)} ${row.roleSlug} on ${statusLabel(row.onStatusSlug, names)}`}
              onChange={(checked) => toggle(row, checked)}
            />
          </div>
        );
      })}
      <p style={{ margin: 0, padding: '12px 16px', fontSize: 12.5, color: color.muted, lineHeight: 1.5 }}>
        Runs after the move. Logged as via automation.
      </p>
    </section>
  );
}
