import { Empty, Input } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { USE_TASK_MOCKS } from '../api/queries';
import { mockApi } from '../api/mockData';
import type { Project, Task } from '../api/types';
import { useTaskParam } from '../components/useTaskParam';

export function SearchScreen() {
  const [params, setParams] = useSearchParams();
  const q0 = params.get('q') ?? '';
  const [q, setQ] = useState(q0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Pick<Project, 'id' | 'key' | 'name' | 'color'>[]>([]);
  const { openTask } = useTaskParam();

  useEffect(() => {
    const run = async () => {
      if (!q.trim()) {
        setTasks([]);
        setProjects([]);
        return;
      }
      if (USE_TASK_MOCKS) {
        const [allProjects, web, cli] = await Promise.all([
          mockApi.listProjects(),
          mockApi.listProjectTasks('WEB').catch(() => []),
          mockApi.listProjectTasks('CLI').catch(() => []),
        ]);
        const n = q.toLowerCase();
        setTasks([...web, ...cli].filter((t) => t.title.toLowerCase().includes(n) || t.key.toLowerCase().includes(n)));
        setProjects(allProjects.filter((p) => p.name.toLowerCase().includes(n) || p.key.toLowerCase().includes(n)));
        return;
      }
      const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      const json = await res.json() as { tasks: Task[]; projects: typeof projects };
      setTasks(json.tasks ?? []);
      setProjects(json.projects ?? []);
    };
    void run();
  }, [q]);

  return (
    <div className="bt-page" style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
      <h1 className="bt-h1">Search</h1>
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setParams(e.target.value ? { q: e.target.value } : {}, { replace: true });
        }}
        placeholder="Search tasks or jump to WEB-142"
        allowClear
      />
      {!q.trim() && <Empty description="Type a task key or a few words." />}
      {projects.length > 0 && (
        <section className="bt-card">
          <div className="bt-group-head">Projects</div>
          {projects.map((p) => (
            <Link key={p.key} to={`/p/${p.key}/list`} className="bt-row" style={{ color: 'inherit', textDecoration: 'none' }}>
              {p.name}
            </Link>
          ))}
        </section>
      )}
      {tasks.length > 0 && (
        <section className="bt-card">
          <div className="bt-group-head">Tasks</div>
          {tasks.map((t) => (
            <button key={t.key} className="bt-row" type="button" onClick={() => openTask(t.key)}>
              <span className="bt-key">{t.key}</span>
              <span className="bt-row-title">{t.title}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
