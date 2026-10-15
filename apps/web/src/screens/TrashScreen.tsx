import { Button, Empty, Skeleton } from 'antd';
import { useParams } from 'react-router-dom';
import { USE_TASK_MOCKS, useProject, useProjectTrash, useRestoreTask } from '../api/queries';
import { NoAccess } from '../components/NoAccess';
import { ProjectHeader } from '../components/ProjectHeader';
import { useTaskParam } from '../components/useTaskParam';
import { color } from '../theme/tokens';

export function TrashScreen() {
  const { projectKey = '' } = useParams();
  const { openTask } = useTaskParam();
  const detail = useProject(projectKey);
  const trash = useProjectTrash(projectKey);
  const restore = useRestoreTask();

  if (detail.isError) return <NoAccess projectKey={projectKey} error={detail.error} />;
  if (!detail.data) return <div className="bt-page"><Skeleton active paragraph={{ rows: 8 }} /></div>;

  const rows = trash.data ?? [];
  return (
    <div className="bt-page">
      <ProjectHeader detail={detail.data} />
      <p style={{ color: color.muted, margin: 0 }}>Kept for 30 days, then removed for good.</p>
      {trash.isError ? (
        <p style={{ color: color.danger, margin: 0 }}>Could not load trash.</p>
      ) : rows.length === 0 ? (
        <Empty description={USE_TASK_MOCKS ? 'Trash is empty in mock mode (restore from the Undo toast).' : 'Trash is empty.'} />
      ) : (
        <section className="bt-card">
          {rows.map((t) => (
            <div key={t.key} className="bt-row">
              <span className="bt-key">{t.key}</span>
              <button className="bt-row-title" type="button" onClick={() => openTask(t.key)}>{t.title}</button>
              <span style={{ fontSize: 12.5, color: color.muted }}>{trashMeta(t)}</span>
              <Button size="small" onClick={() => restore.mutate(t.key)}>Restore</Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function trashMeta(task: { deletedByName?: string | null; daysLeft?: number | null }) {
  const who = task.deletedByName ? `Deleted by ${task.deletedByName}` : null;
  if (task.daysLeft == null) return who;
  const left = task.daysLeft === 1 ? '1 day left' : task.daysLeft === 0 ? 'less than a day left' : `${task.daysLeft} days left`;
  return who ? `${who} · ${left}` : left;
}
