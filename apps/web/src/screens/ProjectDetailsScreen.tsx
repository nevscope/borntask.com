import { Alert, Button, Input, Modal, Radio, Select, Switch } from 'antd';
import type { WorkBreakdown } from '../api/types';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe, useProject } from '../api/queries';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProjectColourField } from '../components/ProjectColourField';
import { SettingsFrame } from '../components/SettingsNav';
import { useStatusToast } from '../components/StatusToast';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { color, parseProjectHex } from '../theme/tokens';

type WorkflowOption = { id: string; name: string; statuses?: { name: string; side?: boolean }[] };
type SavedProject = { name: string; colour: string; workflowId: string; workBreakdown: WorkBreakdown; storiesNeedApproval: boolean };

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
  const navigate = useNavigate();
  const toast = useStatusToast();
  const [name, setName] = useState('');
  const [colour, setColour] = useState('');
  const [hexDraft, setHexDraft] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [workBreakdown, setWorkBreakdown] = useState<WorkBreakdown>('off');
  const [storiesNeedApproval, setStoriesNeedApproval] = useState(true);
  const [readyKey, setReadyKey] = useState('');
  const [saved, setSaved] = useState<SavedProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmWorkflow, setConfirmWorkflow] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
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
    const breakdown = detail.data?.workBreakdown ?? 'off';
    const approval = detail.data?.storiesNeedApproval !== false;
    setWorkBreakdown(breakdown);
    setStoriesNeedApproval(approval);
    setSaved({ name: project.name, colour: next, workflowId: project.workflowId, workBreakdown: breakdown, storiesNeedApproval: approval });
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
      || workBreakdown !== saved.workBreakdown
      || storiesNeedApproval !== saved.storiesNeedApproval
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
        body: JSON.stringify({ name: name.trim(), colour, workflowId, workBreakdown, storiesNeedApproval }),
      });
      const json = await res.json().catch(() => ({})) as { message?: string; colour?: string; name?: string; workflowId?: string; workBreakdown?: WorkBreakdown; storiesNeedApproval?: boolean };
      if (!res.ok) throw new Error(json.message ?? 'Could not save the project.');
      const nextName = json.name ?? name.trim();
      const next = parseProjectHex(json.colour ?? colour) ?? colour;
      const nextWorkflow = json.workflowId ?? workflowId;
      setName(nextName);
      setColour(next);
      setHexDraft(next);
      setWorkflowId(nextWorkflow);
      const nextBreakdown = json.workBreakdown ?? workBreakdown;
      const nextApproval = json.storiesNeedApproval ?? storiesNeedApproval;
      setWorkBreakdown(nextBreakdown);
      setStoriesNeedApproval(nextApproval);
      setSaved({ name: nextName, colour: next, workflowId: nextWorkflow, workBreakdown: nextBreakdown, storiesNeedApproval: nextApproval });
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

  async function setArchived(archived: boolean) {
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/archive`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      const json = await res.json().catch(() => ({})) as { message?: string };
      if (!res.ok) throw new Error(json.message ?? (archived ? 'Could not archive this project.' : 'Could not restore this project.'));
      void qc.invalidateQueries({ queryKey: qk.projects });
      void qc.invalidateQueries({ queryKey: ['projects', 'archived'] });
      void qc.invalidateQueries({ queryKey: qk.project(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.myTasks });
      setConfirmArchive(false);
      setConfirmRestore(false);
      toast.show(archived ? `${project?.name ?? 'Project'} archived.` : `${project?.name ?? 'Project'} restored.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this project.');
    } finally {
      setClosing(false);
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
      {project?.archived && (
        <Alert type="info" showIcon message="This project is archived. It sits on the Archived tab until you restore it." />
      )}
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
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Work breakdown
            <Radio.Group
              value={workBreakdown}
              disabled={!canManage}
              onChange={(e) => setWorkBreakdown(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <Radio value="off">Off - a flat list of tasks</Radio>
              <Radio value="stories">Stories</Radio>
              <Radio value="epics_stories">Epics and stories</Radio>
            </Radio.Group>
            <span style={{ fontSize: 12.5, fontWeight: 400, color: color.muted }}>
              Optional. If you used Jira, turn on epics and stories. They stay as tasks on this workflow. Turning this off hides grouping and those types; existing parents stay.
            </span>
          </label>
          {workBreakdown !== 'off' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500 }}>
              <Switch checked={storiesNeedApproval} disabled={!canManage} onChange={setStoriesNeedApproval} />
              Stories and epics start in Idea
            </label>
          )}
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
      {canManage && project && (
        <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: '1 1 280px' }}>
              <span style={{ display: 'block', fontWeight: 600 }}>{project.archived ? 'Restore project' : 'Archive project'}</span>
              <span style={{ fontSize: 13, color: color.muted }}>
                {project.archived
                  ? 'Puts it back on Active. Tasks, members and the key stay as they are.'
                  : 'Hides it from Active. Use this when work has stopped. You can restore it from the Archived tab.'}
              </span>
            </span>
            {project.archived ? (
              <Button onClick={() => setConfirmRestore(true)} loading={closing}>Restore…</Button>
            ) : (
              <Button onClick={() => setConfirmArchive(true)} loading={closing}>Archive…</Button>
            )}
          </div>
          <div style={{ height: 1, background: color.divider }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: '1 1 280px' }}>
              <span style={{ display: 'block', fontWeight: 600, color: color.danger }}>Delete project</span>
              <span style={{ fontSize: 13, color: color.muted }}>
                Removes the project and its tasks for good. Use this when it was created by mistake. You will be asked to type the project name.
              </span>
            </span>
            <Button
              danger
              onClick={() => {
                setConfirmName('');
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Delete project…
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
      <ConfirmDialog
        open={confirmArchive}
        title="Archive this project?"
        confirmLabel="Archive project"
        busy={closing}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => void setArchived(true)}
      >
        {project?.name ?? 'This project'} leaves Active and moves to the Archived tab. Tasks stay in place. You can restore it later.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmRestore}
        title="Restore this project?"
        confirmLabel="Restore project"
        busy={closing}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => void setArchived(false)}
      >
        {project?.name ?? 'This project'} goes back on the Active tab.
      </ConfirmDialog>
      <Modal
        title="Delete project"
        open={deleteOpen}
        okText="Delete project"
        okButtonProps={{ danger: true, disabled: confirmName !== (project?.name ?? ''), loading: closing }}
        onCancel={() => setDeleteOpen(false)}
        onOk={() => {
          if (!project || confirmName !== project.name) return;
          setDeleteError(null);
          setClosing(true);
          void fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/delete`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: confirmName }),
          }).then(async (res) => {
            const json = await res.json().catch(() => ({})) as { message?: string };
            setClosing(false);
            if (!res.ok) {
              setDeleteError(json.message ?? 'Could not delete this project.');
              return;
            }
            setDeleteOpen(false);
            void qc.invalidateQueries({ queryKey: qk.projects });
            void qc.invalidateQueries({ queryKey: ['projects', 'archived'] });
            void qc.invalidateQueries({ queryKey: qk.myTasks });
            toast.show(`${project.name} deleted.`);
            navigate('/projects');
          });
        }}
      >
        <p style={{ marginTop: 0 }}>
          Type <strong>{project?.name}</strong> to delete this project and its tasks. This is for projects created by mistake. It cannot be undone.
        </p>
        {deleteError && <Alert type="error" message={deleteError} style={{ marginBottom: 12 }} />}
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label="Project name" />
      </Modal>
    </SettingsFrame>
  );
}
