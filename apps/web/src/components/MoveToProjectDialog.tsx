import { Select } from 'antd';
import { useEffect, useState } from 'react';
import { useProject, useProjects } from '../api/queries';
import { ConfirmDialog } from './ConfirmDialog';

export function MoveToProjectDialog({
  open,
  sourceProjectKey,
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  sourceProjectKey: string;
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (input: { projectKey: string; sectionId: string }) => void;
}) {
  const projects = useProjects().data ?? [];
  const [projectKey, setProjectKey] = useState('');
  const dest = useProject(projectKey);
  const sections = dest.data?.sections ?? [];

  useEffect(() => {
    if (!open) {
      setProjectKey('');
    }
  }, [open]);

  const choices = projects.filter((project) => project.key !== sourceProjectKey && !project.archived && project.canOpen !== false);
  const sectionId = sections[0]?.id ?? '';
  const [chosenSection, setChosenSection] = useState('');
  useEffect(() => {
    setChosenSection(sections[0]?.id ?? '');
  }, [projectKey, sections]);

  const destName = choices.find((project) => project.key === projectKey)?.name ?? 'that project';
  const label = count === 1 ? 'task' : 'tasks';

  return (
    <ConfirmDialog
      open={open}
      title={count === 1 ? 'Move this task to another project?' : `Move ${count} tasks to another project?`}
      confirmLabel={count === 1 ? 'Move task' : `Move ${count} tasks`}
      tone="primary"
      busy={busy}
      confirmDisabled={!projectKey || !chosenSection}
      onCancel={onCancel}
      onConfirm={() => onConfirm({ projectKey, sectionId: chosenSection || sectionId })}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0 }}>
          The {label} will get a new key in the destination project. Comments, files and history stay on the {label}.
        </p>
        <Select
          aria-label="Destination project"
          placeholder="Choose a project"
          value={projectKey || undefined}
          options={choices.map((project) => ({ value: project.key, label: `${project.name} (${project.key})` }))}
          onChange={setProjectKey}
          showSearch
          optionFilterProp="label"
        />
        <Select
          aria-label="Destination section"
          placeholder={projectKey ? 'Choose a section' : 'Choose a project first'}
          value={chosenSection || undefined}
          disabled={!projectKey || dest.isLoading}
          options={sections.map((section) => ({ value: section.id, label: section.name }))}
          onChange={setChosenSection}
        />
        {projectKey ? (
          <p style={{ margin: 0 }}>
            Status is matched to a stage in {destName}. If someone is not on that project they will be unassigned.
          </p>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
