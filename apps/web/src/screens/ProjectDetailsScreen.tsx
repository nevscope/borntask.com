import { Alert, Button, Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe, useProject } from '../api/queries';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProjectColourField } from '../components/ProjectColourField';
import { SettingsFrame } from '../components/SettingsNav';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { color, parseProjectHex } from '../theme/tokens';

type WorkflowOption = { id: string; name: string; statuses?: { name: string; side?: boolean }[] };
type SavedProject = { name: string; colour: string; workflowId: string };

function workflowLabel(workflow: WorkflowOption) {
  const stages = (workflow.statuses ?? []).filter((stage) => !stage.side).map((stage) => stage.name);
  return stages.length ? `${workflow.name}: ${stages.join(', ')}` : workflow.name;
}

export function ProjectDetailsScreen() {
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const detail = useProject(projectKey);
  const project = detail.data?.project;
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [colour, setColour] = useState('');
  const [hexDraft, setHexDraft] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [readyKey, setReadyKey] = useState('');
  const [saved, setSaved] = useState<SavedProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmWorkflow, setConfirmWorkflow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/workflows`, { credentials: 'include' });
      if (!res.ok) return [] as WorkflowOption[];
      return (await res.json()) as WorkflowOption[];
    },
  });

  useEffect(() => {
    if (!project || readyKey === projectKey) return;
    const next = parseProjectHex(project.color) ?? project.color;
    setName(project.name);
    setColour(next);
    setHexDraft(next);
    setWorkflowId(project.workflowId);
    setSaved({ name: project.name, colour: next, workflowId: project.workflowId });
    setReadyKey(projectKey);
    setError(null);
  }, [project, projectKey, readyKey]);

  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const myRoles = detail.data?.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const canManage = canAdmin || myRoles.includes('lead') || project?.leadId === me?.user.id;
  const workflowChanged = Boolean(saved && workflowId && workflowId !== saved.workflowId);
  const dirty = Boolean(
    saved && readyKey === projectKey && (
      name.trim() !== saved.name
      || colour.toLowerCase() !== saved.colour.toLowerCase()
      || workflowChanged
    ),
  );
  const unsaved = useUnsavedChanges(dirty);

  async function save() {
    if (!canManage || !parseProjectHex(colour) || name.trim().length < 2) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), colour, workflowId }),
      });
      const json = await res.json().catch(() => ({})) as { message?: string; colour?: string; name?: string; workflowId?: string };
      if (!res.ok) throw new Error(json.message ?? 'Could not save the project.');
      const nextName = json.name ?? name.trim();
      const next = parseProjectHex(json.colour ?? colour) ?? colour;
      const nextWorkflow = json.workflowId ?? workflowId;
      setName(nextName);
      setColour(next);
      setHexDraft(next);
      setWorkflowId(nextWorkflow);
      setSaved({ name: nextName, colour: next, workflowId: nextWorkflow });
      setConfirmWorkflow(false);
      void qc.invalidateQueries({ queryKey: qk.projects });
      void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.projectTasks(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.myTasks });
      void qc.invalidateQueries({ queryKey: ['search'] });
      void qc.invalidateQueries({ queryKey: ['workflows'] });
    } catch (err) {
      setConfirmWorkflow(false);
      setError(err instanceof Error ? err.message : 'Could not save the project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      {unsaved}
      <h1 className="bt-h1">Name, colour and workflow</h1>
      <p style={{ color: color.muted, margin: '6px 0 0', fontSize: 13.5 }}>
        Project leads and workspace admins can change these. The key stays the same, so existing task numbers keep working.
      </p>
      {!canManage && project && <Alert type="warning" message="You can view this page, but only a project lead or workspace admin can save changes." />}
      {detail.isError && <Alert type="error" message="Could not load this project." />}
      {error && <Alert type="error" message={error} />}
      {project && (
        <section className="bt-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Project name
            <Input
              value={name}
              disabled={!canManage}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              style={{ height: 40, maxWidth: 420 }}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 160 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              Key
              <Input value={project.key} disabled style={{ height: 40, letterSpacing: '0.04em' }} />
            </label>
            <span style={{ fontSize: 12.5, color: color.muted }}>Used in task numbers such as {project.key}-142.</span>
          </div>
          <ProjectColourField
            colour={colour}
            hexDraft={hexDraft}
            disabled={!canManage}
            onColour={setColour}
            onHexDraft={setHexDraft}
          />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, maxWidth: 520 }}>
            Workflow
            <Select
              value={workflowId || undefined}
              disabled={!canManage}
              onChange={setWorkflowId}
              options={(workflows.data ?? []).map((workflow) => ({ value: workflow.id, label: workflowLabel(workflow) }))}
            />
            <span style={{ fontSize: 12.5, fontWeight: 400, color: color.muted }}>
              Changing workflow moves existing tasks to the closest stage. A stage with the same name stays. To edit the stages themselves, open Workflow in the settings menu.
            </span>
          </label>
          <div>
            <Button
              type="primary"
              disabled={!canManage || !dirty || name.trim().length < 2 || !workflowId}
              loading={saving}
              onClick={() => {
                if (workflowChanged) setConfirmWorkflow(true);
                else void save();
              }}
            >
              Save
            </Button>
          </div>
        </section>
      )}
      <ConfirmDialog
        open={confirmWorkflow}
        title="Change workflow?"
        confirmLabel="Change workflow"
        busy={saving}
        onCancel={() => setConfirmWorkflow(false)}
        onConfirm={() => void save()}
      >
        Tasks on this project move to the closest stage. A stage with the same name stays put. Review stages on a workflow without them, such as Simple, move to the first active stage.
      </ConfirmDialog>
    </SettingsFrame>
  );
}
