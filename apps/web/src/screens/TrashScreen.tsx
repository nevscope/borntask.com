import { Button, Empty } from 'antd';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qk, USE_TASK_MOCKS } from '../api/queries';
import { BASE_URL } from '../api/http';
import type { Task } from '../api/types';
import { useTaskParam } from '../components/useTaskParam';

export function TrashScreen() {
  const { projectKey = '' } = useParams();
  const { openTask } = useTaskParam();
  const qc = useQueryClient();
  const trash = useQuery({
    queryKey: ['trash', projectKey],
    queryFn: async () => {
      if (USE_TASK_MOCKS) return [] as Task[];
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/trash`, { credentials: 'include' });
      return (await res.json()) as Task[];
    },
  });
  const restore = useMutation({
    mutationFn: (key: string) => api.restoreTask(key),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trash', projectKey] });
      void qc.invalidateQueries({ queryKey: qk.projectTasks(projectKey) });
    },
  });

  const rows = trash.data ?? [];
  return (
    <div className="bt-page">
      <h1 className="bt-h1">Trash · {projectKey}</h1>
      <p style={{ color: '#5B6157' }}>Deleted tasks stay here for 30 days.</p>
      {rows.length === 0 ? (
        <Empty description={USE_TASK_MOCKS ? 'Trash is empty in mock mode (restore from the Undo toast).' : 'Trash is empty.'} />
      ) : (
        <section className="bt-card">
          {rows.map((t) => (
            <div key={t.key} className="bt-row">
              <span className="bt-key">{t.key}</span>
              <button className="bt-row-title" type="button" onClick={() => openTask(t.key)}>{t.title}</button>
              <Button size="small" onClick={() => restore.mutate(t.key)}>Restore</Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
