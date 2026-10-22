import { Button, Empty, Segmented } from 'antd';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { USE_PROJECT_MOCKS, useMe, useProjects, useRequestProjectAccess } from '../api/queries';
import type { Project, StatusCounts } from '../api/types';
import { ProjectStar } from '../components/ProjectStar';
import { categoryBar, color, font, projectTint, radius } from '../theme/tokens';

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
  const requestAccess = useRequestProjectAccess();
  const role = useMe().data?.workspaceRole;
  const canCreate = role !== 'viewer' && role !== 'guest';
  const rows = tab === 'archived' ? (USE_PROJECT_MOCKS ? [] : archived.data ?? []) : live.data ?? [];

  return (
    <div className="bt-page" style={{ maxWidth: 1160, margin: '0 auto', width: '100%', gap: 20, paddingTop: 28 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h1 className="bt-h1" style={{ flex: '1 1 200px', fontSize: 26 }}>Projects</h1>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as 'active' | 'archived')}
          options={[
            { label: 'Active', value: 'active' },
            { label: 'Archived', value: 'archived' },
          ]}
        />
        {canCreate && (
          <>
            <Link to="/import"><Button>Import from Asana</Button></Link>
            <Link to="/projects/new">
              <Button type="primary">New project</Button>
            </Link>
          </>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty description={tab === 'archived' ? 'No archived projects.' : 'No projects yet.'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {rows.map((p) => (
            <ProjectCard key={p.id} project={p} onRequest={() => requestAccess.mutate(p.key)} requesting={requestAccess.isPending && requestAccess.variables === p.key} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12.5, color: color.muted }}>
        <Legend swatch={categoryBar.backlog} label="Backlog" />
        <Legend swatch={categoryBar.active} label="Active" />
        <Legend swatch={categoryBar.review} label="Review" />
        <Legend swatch={categoryBar.done} label="Done" />
      </div>
    </div>
  );
}

function ProjectCard({ project: p, onRequest, requesting }: { project: Project; onRequest: () => void; requesting: boolean }) {
  const locked = p.canOpen === false;
  const body = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: projectTint(p.color).tint, color: projectTint(p.color).ink, fontSize: 11, fontWeight: 600, fontFamily: font.ui }}>{p.key}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{p.name}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: color.muted }}>{p.leadName ? `Lead: ${p.leadName}` : 'No lead'}</span>
        </span>
        {p.pendingInvite && <span style={{ fontSize: 12, fontWeight: 600, color: color.brandStrong }}>Invitation</span>}
        {!locked && (p.guestCount ?? 0) > 0 && <span style={{ fontSize: 12, color: color.muted }}>{p.guestCount} {p.guestCount === 1 ? 'guest' : 'guests'}</span>}
        {!locked && <ProjectStar projectKey={p.key} name={p.name} starred={p.starred} />}
      </span>
      {locked ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: color.ink3 }}>You need access to open this project.</span>
          {p.accessRequested ? (
            <span style={{ fontSize: 12.5, color: color.brandStrong, fontWeight: 600 }}>Request sent</span>
          ) : (
            <button
              type="button"
              onClick={(event) => { event.preventDefault(); onRequest(); }}
              disabled={requesting}
              style={{ height: 32, padding: '0 12px', border: 0, borderRadius: radius.md, background: color.brandFill, color: color.brandOn, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: requesting ? 'wait' : 'pointer' }}
            >
              Request
            </button>
          )}
        </span>
      ) : (
        <>
          <CategoryBar counts={p.counts} />
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12.5, color: color.ink3 }}>
            <span><strong>{p.counts.backlog + p.counts.active + p.counts.review}</strong> open</span>
            <span><strong>{p.counts.review}</strong> in review</span>
            <span><strong>{p.counts.done}</strong> deployed</span>
            {p.updatedAt && <span style={{ marginLeft: 'auto', color: color.muted }}>{relTime(p.updatedAt)}</span>}
          </span>
        </>
      )}
    </>
  );
  const box: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 18,
    background: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: 12,
    color: color.ink,
    textDecoration: 'none',
  };
  if (locked) return <div style={box}>{body}</div>;
  return <Link to={`/p/${p.key}/list`} style={box}>{body}</Link>;
}

function CategoryBar({ counts }: { counts: StatusCounts }) {
  const parts = [
    ['backlog', counts.backlog, categoryBar.backlog],
    ['active', counts.active, categoryBar.active],
    ['review', counts.review, categoryBar.review],
    ['done', counts.done, categoryBar.done],
  ] as const;
  const total = parts.reduce((sum, [, n]) => sum + n, 0);
  return (
    <span style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: color.chip, gap: 2 }} aria-hidden="true">
      {total === 0
        ? <span style={{ flex: 1, background: color.chip }} />
        : parts.filter(([, n]) => n > 0).map(([key, n, bg]) => <span key={key} style={{ flex: n, background: bg }} />)}
    </span>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 6, borderRadius: 2, background: swatch }} />
      {label}
    </span>
  );
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
