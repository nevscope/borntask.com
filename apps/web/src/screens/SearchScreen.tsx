import { Checkbox, Empty, Select } from 'antd';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearch } from '../api/queries';
import type { SearchHit, StatusCategory, TaskType } from '../api/types';
import { StatusPill, TypeTag } from '../components/Chips';
import { useTaskParam } from '../components/useTaskParam';
import { highlightParts } from '../lib/search';
import { color } from '../theme/tokens';

function whereLine(hit: SearchHit): string {
  if (hit.matchField === 'description') return `Description: "${hit.matchSnippet}"`;
  if (hit.matchField === 'comment') {
    const who = hit.commentAuthor ?? 'someone';
    return `Comment by ${who}: "${hit.matchSnippet}"`;
  }
  const section = hit.sectionName ?? 'No section';
  const who = hit.assigneeName ?? 'unassigned';
  return `Title · ${section} · ${who}`;
}

export function SearchScreen() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const search = useSearch(q);
  const { openTask } = useTaskParam();
  const [project, setProject] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [includeDone, setIncludeDone] = useState(false);

  const hits = search.data?.hits ?? [];
  const projects = useMemo(() => {
    const map = new Map<string, { key: string; name: string }>();
    for (const h of hits) map.set(h.projectKey, { key: h.projectKey, name: h.projectName });
    return [...map.values()];
  }, [hits]);

  const filtered = hits.filter((h) => {
    if (project !== 'all' && h.projectKey !== project) return false;
    if (type !== 'all' && h.type !== type) return false;
    if (status !== 'all' && h.statusId !== status) return false;
    if (!includeDone && (h.statusCategory as StatusCategory) === 'done') return false;
    return true;
  });

  const groups = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, SearchHit[]>();
    for (const h of filtered) {
      if (!by.has(h.projectKey)) {
        by.set(h.projectKey, []);
        order.push(h.projectKey);
      }
      by.get(h.projectKey)!.push(h);
    }
    return order.map((key) => {
      const items = by.get(key)!;
      return { key, name: items[0]!.projectName, color: items[0]!.projectColor, items };
    });
  }, [filtered]);

  const statuses = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of hits) map.set(h.statusId, h.statusName);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [hits]);

  return (
    <div className="bt-page" style={{ maxWidth: 960, margin: '0 auto', width: '100%', gap: 18, paddingTop: 28 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
        <h1 className="bt-h1" style={{ fontSize: 22 }}>
          {!q.trim()
            ? 'Search'
            : search.isFetching
              ? `Searching for "${q.trim()}"`
              : `${filtered.length} result${filtered.length === 1 ? '' : 's'} for "${q.trim()}"`}
        </h1>
        {q.trim() ? (
          <span style={{ fontSize: 13, color: color.muted }}>
            in titles, descriptions and comments{search.data ? ` · ${search.data.tookMs} ms` : ''}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Select
          value={project}
          onChange={setProject}
          style={{ minWidth: 140, height: 32, fontSize: 13 }}
          options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.key, label: p.name }))]}
        />
        <Select
          value={type}
          onChange={setType}
          style={{ minWidth: 120, height: 32, fontSize: 13 }}
          options={[
            { value: 'all', label: 'Any type' },
            { value: 'idea', label: 'Idea' },
            { value: 'bug', label: 'Bug' },
            { value: 'improvement', label: 'Improvement' },
            { value: 'feature', label: 'Feature' },
          ]}
        />
        <Select
          value={status}
          onChange={setStatus}
          style={{ minWidth: 140, height: 32, fontSize: 13 }}
          options={[{ value: 'all', label: 'Any status' }, ...statuses]}
        />
        <Checkbox className="bt-check-row" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} style={{ height: 32, fontSize: 13 }}>
          Include Deployed and Rejected
        </Checkbox>
      </div>

      {!q.trim() && <Empty description="Type a task key or a few words." />}
      {q.trim() && search.isFetching && <p style={{ margin: 0, color: color.muted }}>Looking in titles, descriptions and comments…</p>}
      {q.trim() && !search.isFetching && filtered.length === 0 && (
        <Empty description="No tasks match. Try another word, or include Deployed and Rejected." />
      )}

      {groups.map((g) => (
        <section key={g.key} className="bt-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: g.color }} />
            {g.name}
            <span style={{ fontWeight: 500, color: color.muted }}>{g.items.length}</span>
          </div>
          {g.items.map((r) => {
            const parts = r.matchField === 'title' ? highlightParts(r.title, q) : { pre: r.title, hit: '', post: '' };
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => openTask(r.key)}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  gap: '6px 14px',
                  width: '100%',
                  padding: '12px 16px',
                  border: 0,
                  borderTop: `1px solid ${color.divider}`,
                  background: color.surface,
                  color: color.ink,
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 58, fontSize: 12.5, color: color.muted, paddingTop: 1 }}>{r.key}</span>
                <span style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 500 }}>
                    {parts.pre}
                    {parts.hit ? <mark className="bt-hit">{parts.hit}</mark> : null}
                    {parts.post}
                  </span>
                  <span style={{ fontSize: 12.5, color: color.muted }}>{whereLine(r)}</span>
                </span>
                <TypeTag type={r.type as TaskType} />
                <StatusPill status={{ id: r.statusId, name: r.statusName, category: r.statusCategory, tone: r.statusTone, position: 0, wipLimit: null, side: false }} />
              </button>
            );
          })}
        </section>
      ))}

      <p style={{ margin: 0, fontSize: 13, color: color.muted }}>
        Tip: type a task key like <kbd className="bt-kbd">WEB-142</kbd> to jump straight to it.
      </p>
    </div>
  );
}
