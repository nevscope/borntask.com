import { Button, Select, Switch } from 'antd';
import { useState } from 'react';
import { defaultAutomationsForStatuses } from '@borntask/shared';
import { useProject, useProjectAutomations, useSaveProjectAutomations } from '../api/queries';
import type { AutomationRule } from '../api/queries';
import { RoleTag } from './Chips';
import { useWorkspaceCatalog } from '../api/catalog';
import type { ProjectRole } from '../api/types';
import { color } from '../theme/tokens';

const FALLBACK_ROLES: ProjectRole[] = ['lead', 'business', 'developer', 'tester', 'observer'];

function statusLabel(slug: string, names: Map<string, string>) {
  return names.get(slug) ?? slug.replace(/_/g, ' ');
}

function actionLabel(action: AutomationRule['action']) {
  return action === 'assign_role' ? 'Assign' : 'Notify';
}

export function AutomationsCard({ projectKey }: { projectKey: string }) {
  const catalog = useWorkspaceCatalog();
  const ROLES = catalog.roles.length ? catalog.roles.map((r) => r.slug) : FALLBACK_ROLES;
  const asRole = (slug: string): ProjectRole | null => (ROLES.includes(slug) ? slug : null);
  const project = useProject(projectKey);
  const query = useProjectAutomations(projectKey);
  const save = useSaveProjectAutomations(projectKey);
  const canManage = query.data?.canManage ?? false;
  const statuses = project.data?.workflow.statuses ?? [];
  const names = new Map(statuses.map((status) => [status.id, status.name]));
  const templates = defaultAutomationsForStatuses(statuses.map((status) => status.id));
  const isTemplate = (row: AutomationRule) =>
    templates.some((item) => item.onStatusSlug === row.onStatusSlug && item.action === row.action);
  const [draftStatus, setDraftStatus] = useState<string | undefined>();
  const [draftAction, setDraftAction] = useState<AutomationRule['action']>('assign_role');
  const [draftRole, setDraftRole] = useState<string>('tester');

  const persist = (next: AutomationRule[]) => save.mutate(next);

  const toggle = (row: AutomationRule, enabled: boolean) => {
    const current = query.data?.automations ?? [];
    persist(
      current.map((item) =>
        item.onStatusSlug === row.onStatusSlug && item.action === row.action ? { ...item, enabled } : item,
      ),
    );
  };

  const remove = (row: AutomationRule) => {
    persist((query.data?.automations ?? []).filter((item) => !(item.onStatusSlug === row.onStatusSlug && item.action === row.action)));
  };

  const add = () => {
    const onStatusSlug = draftStatus ?? statuses[0]?.id;
    if (!onStatusSlug) return;
    const current = query.data?.automations ?? [];
    if (current.some((item) => item.onStatusSlug === onStatusSlug && item.action === draftAction)) return;
    persist([...current, { onStatusSlug, action: draftAction, roleSlug: draftRole, enabled: true }]);
  };

  return (
    <section className="bt-card">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
        <h2 style={{ flex: '1 1 200px', margin: 0, fontSize: 15, fontWeight: 600 }}>Automations</h2>
        <span style={{ fontSize: 12.5, color: color.muted }}>When a task enters a stage. Runs after the move, logged as via automation.</span>
      </div>
      {(query.data?.automations ?? []).map((row) => {
        const role = asRole(row.roleSlug);
        return (
          <div
            key={`${row.onStatusSlug}:${row.action}`}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1.2fr) 72px minmax(90px, 1fr) 52px 72px', gap: 10, alignItems: 'center', minHeight: 52, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}
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
            {canManage && !isTemplate(row) ? (
              <button type="button" onClick={() => remove(row)} style={{ height: 32, border: 0, background: 'transparent', color: color.danger, font: 'inherit', fontSize: 13, cursor: 'pointer' }}>
                Remove
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      {canManage && statuses.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 16px' }}>
          <Select
            style={{ minWidth: 160 }}
            value={draftStatus ?? statuses[0]?.id}
            onChange={setDraftStatus}
            options={statuses.map((status) => ({ value: status.id, label: status.name }))}
            aria-label="Stage for new automation"
          />
          <Select
            style={{ minWidth: 120 }}
            value={draftAction}
            onChange={setDraftAction}
            options={[
              { value: 'assign_role', label: 'Assign' },
              { value: 'notify_role', label: 'Notify' },
            ]}
            aria-label="Automation action"
          />
          <Select
            style={{ minWidth: 140 }}
            value={draftRole}
            onChange={setDraftRole}
            options={ROLES.map((slug) => ({ value: slug, label: slug }))}
            aria-label="Role for new automation"
          />
          <Button type="primary" onClick={add} loading={save.isPending}>
            Add rule
          </Button>
        </div>
      )}
    </section>
  );
}
