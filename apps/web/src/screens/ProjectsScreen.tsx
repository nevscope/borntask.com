import { Button, Empty, Segmented } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { USE_PROJECT_MOCKS, useProjects } from '../api/queries';
import type { Project } from '../api/types';
import { color } from '../theme/tokens';

export function ProjectsScreen() {
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const live = useProjects();
  const archived = useQuery({
    queryKey: ['projects', 'archived'],
    enabled: tab === 'archived' && !USE_PROJECT_MOCKS,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/projects?archived=true`, { credentials: 'include' });
      if (!res.ok) return [] as Project[];
      return (await res.json()) as Project[];
    },
  });
  const rows = tab === 'archived' ? (USE_PROJECT_MOCKS ? [] : archived.data ?? []) : live.data ?? [];

  return (
    <div className="bt-page">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h1 className="bt-h1" style={{ flex: '1 1 200px' }}>Projects</h1>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as 'active' | 'archived')}
          options={[
            { label: 'Active', value: 'active' },
            { label: 'Archived', value: 'archived' },
          ]}
        />
        <Link to="/import"><Button>Import from Asana</Button></Link>
        <Link to="/projects/new"><Button type="primary">New project</Button></Link>
      </div>
      {rows.length === 0 ? (
        <Empty description={tab === 'archived' ? 'No archived projects.' : 'No projects yet.'} />
      ) : (
        <section className="bt-card">
          {rows.map((p) => (
            <Link key={p.id} to={`/p/${p.key}/list`} className="bt-row" style={{ textDecoration: 'none', color: color.ink }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flex: 'none' }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{p.name}</span>
              <span className="bt-key">{p.key}</span>
              <span style={{ fontSize: 12.5, color: color.muted }}>{p.openCount} open</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
