import { Button, DatePicker, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCreateRelease, useDeleteRelease, useMe, useProjects, useReleases, useUpdateRelease, type WorkspaceRelease } from '../api/queries';
import { formatReleaseDate } from '@borntask/shared';
import { color, categoryBar, font, radius } from '../theme/tokens';

function canManage(role: string | undefined) {
  return role === 'owner' || role === 'admin' || role === 'member';
}

function ProgressBar({ release }: { release: WorkspaceRelease }) {
  const total = Math.max(1, release.progress.total);
  return (
    <div aria-label="Progress by status">
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: color.divider }}>
        {release.progress.byStatus.map((row) => (
          <span
            key={row.id}
            title={`${row.name}: ${row.count}`}
            style={{ width: `${(row.count / total) * 100}%`, background: categoryBar[row.category] }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8, fontSize: 12.5, color: color.ink2 }}>
        {release.progress.byStatus.map((row) => (
          <span key={row.id}>
            {row.name} {row.count}
          </span>
        ))}
        {release.progress.total === 0 && <span>No tasks yet</span>}
      </div>
    </div>
  );
}

export function ReleasesScreen() {
  const me = useMe().data;
  const manage = canManage(me?.workspaceRole);
  const projects = useProjects();
  const [params, setParams] = useSearchParams();
  const projectKey = params.get('project') || undefined;
  const releases = useReleases(projectKey);
  const create = useCreateRelease();
  const update = useUpdateRelease();
  const remove = useDeleteRelease();
  const [draftName, setDraftName] = useState('');
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const openProjects = (projects.data ?? []).filter((project) => project.canOpen !== false);
  const editing = useMemo(() => (releases.data ?? []).find((row) => row.id === editId) ?? null, [editId, releases.data]);

  const setProject = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === 'all') next.delete('project');
    else next.set('project', key);
    setParams(next, { replace: true });
  };

  const submitCreate = () => {
    if (!draftName.trim() || !draftDate) return;
    create.mutate({ name: draftName.trim(), date: draftDate }, {
      onSuccess: () => {
        setCreating(false);
        setDraftName('');
        setDraftDate(null);
      },
    });
  };

  return (
    <div className="bt-page" style={{ maxWidth: 880, gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="bt-h1">Releases</h1>
          <p style={{ margin: '8px 0 0', maxWidth: 560, fontSize: 13.5, lineHeight: 1.45, color: color.muted }}>
            Workspace releases with a name and date. Tasks from any project can join. Filter to one project when the go-live is mostly there.
          </p>
        </div>
        {manage && (
          <Button type="primary" onClick={() => setCreating(true)}>New release</Button>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: color.ink2 }}>
        Project
        <Select
          value={projectKey ?? 'all'}
          onChange={setProject}
          style={{ minWidth: 200 }}
          options={[
            { value: 'all', label: 'All projects' },
            ...openProjects.map((project) => ({ value: project.key, label: project.name })),
          ]}
        />
      </label>

      {releases.isError && (
        <p style={{ margin: 0, color: color.danger }}>Could not load releases. Try again in a moment.</p>
      )}

      {(releases.data ?? []).map((release) => (
        <section key={release.id} className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 18, fontWeight: 600 }}>
                {release.name}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: color.muted }}>
                {formatReleaseDate(release.date)}
                {release.released ? ' · Released' : ' · Planned'}
                {release.projectCount > 0 ? ` · ${release.projectCount === 1 ? '1 project' : `${release.projectCount} projects`}` : ''}
              </p>
            </div>
            {manage && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="small" onClick={() => {
                  setEditId(release.id);
                  setDraftName(release.name);
                  setDraftDate(release.date);
                }}>Edit</Button>
                <Button
                  size="small"
                  danger
                  onClick={() => {
                    if (window.confirm(`Remove ${release.name}? Tasks stay, they just leave this release.`)) {
                      remove.mutate(release.id);
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
          <ProgressBar release={release} />
          {release.released && (
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: color.ink2 }}>Shipped</h3>
              {release.shipped.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: color.muted }}>Nothing is in a done stage yet.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {release.shipped.map((task) => (
                    <li key={task.key} style={{ display: 'flex', gap: 10, fontSize: 13.5 }}>
                      <Link to={`/p/${task.projectKey}/list?task=${task.key}`} style={{ fontWeight: 600, color: color.brandStrong }}>
                        {task.key}
                      </Link>
                      <span style={{ flex: 1, color: color.ink }}>{task.title}</span>
                      <span style={{ color: color.muted }}>{task.projectKey}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!release.released && release.tasks.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {release.tasks.map((task) => (
                <li key={task.key} style={{ display: 'flex', gap: 10, fontSize: 13.5 }}>
                  <Link to={`/p/${task.projectKey}/list?task=${task.key}`} style={{ fontWeight: 600, color: color.brandStrong }}>
                    {task.key}
                  </Link>
                  <span style={{ flex: 1, color: color.ink }}>{task.title}</span>
                  <span style={{ color: color.muted }}>{task.projectKey} · {task.statusName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {!releases.isLoading && (releases.data ?? []).length === 0 && (
        <p style={{ margin: 0, fontSize: 13.5, color: color.muted }}>
          {manage ? 'No releases yet. Create one, then add tasks from any project.' : 'No releases yet.'}
        </p>
      )}

      <Modal
        title={editing ? 'Edit release' : 'New release'}
        open={creating || Boolean(editing)}
        onCancel={() => { setCreating(false); setEditId(null); }}
        onOk={() => {
          if (editing) {
            if (!draftName.trim() || !draftDate) return;
            update.mutate({ id: editing.id, input: { name: draftName.trim(), date: draftDate } }, {
              onSuccess: () => setEditId(null),
            });
            return;
          }
          submitCreate();
        }}
        okText={editing ? 'Save' : 'Create'}
        confirmLoading={create.isPending || update.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <Input
            aria-label="Release name"
            placeholder="Release name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <DatePicker
            aria-label="Release date"
            value={draftDate ? dayjs(draftDate) : null}
            onChange={(value) => setDraftDate(value ? value.format('YYYY-MM-DD') : null)}
            style={{ width: '100%', borderRadius: radius.md }}
          />
        </div>
      </Modal>
    </div>
  );
}
