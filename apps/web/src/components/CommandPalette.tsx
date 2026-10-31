import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProjects, useSearch } from '../api/queries';
import { useQuickAdd } from './QuickAdd';
import { highlightParts } from '../lib/search';
import { color } from '../theme/tokens';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const { pathname } = useLocation();
  const projects = (useProjects().data ?? []).filter((p) => p.canOpen !== false);
  const search = useSearch(q.trim().length >= 2 ? q.trim() : '');
  const navigate = useNavigate();
  const quickAdd = useQuickAdd();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setQ('');
        setActive(0);
        setProjectKey(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const actions = useMemo(() => {
    const onProject = pathname.match(/^\/p\/([^/]+)/)?.[1];
    const boardKey = projectKey ?? onProject ?? projects[0]?.key;
    return [
      { id: 'new-task', label: q.trim() ? `New task named "${q.trim()}"` : 'New task', hint: 'Q', kind: 'action' as const, run: () => quickAdd.open() },
      { id: 'new-project', label: 'New project', hint: '', kind: 'action' as const, run: () => navigate('/projects/new') },
      { id: 'my', label: 'Go to My tasks', hint: 'G then M', kind: 'action' as const, run: () => navigate('/') },
      { id: 'timesheets', label: 'Go to Timesheets', hint: '', kind: 'action' as const, run: () => navigate('/timesheets') },
      { id: 'board', label: 'Switch to board view', hint: 'V', kind: 'action' as const, run: () => { if (boardKey) navigate(`/p/${boardKey}/board`); } },
      { id: 'search', label: 'Search', hint: '', kind: 'action' as const, run: () => navigate(q.trim() ? `/search?q=${encodeURIComponent(q)}` : '/search') },
      { id: 'projects', label: 'Go to Projects', hint: '', kind: 'action' as const, run: () => navigate('/projects') },
      ...projects
        .filter((p) => !projectKey || p.key === projectKey)
        .map((p) => ({
        id: `p-${p.key}`,
        label: `Go to ${p.name}`,
        hint: '',
        kind: 'action' as const,
        run: () => navigate(`/p/${p.key}/list`),
      })),
    ];
  }, [q, projects, projectKey, navigate, quickAdd, pathname]);

  const project = projects.find((p) => p.key === projectKey) ?? null;
  const tasks = (search.data?.hits ?? []).filter((t) => !projectKey || t.projectKey === projectKey).slice(0, 6);
  const rows = [
    ...tasks.map((t) => ({ id: t.key, kind: 'task' as const, label: t.title, status: t.statusName, run: () => navigate(`/p/${t.projectKey}/list?task=${t.key}`) })),
    ...actions,
  ];

  useEffect(() => {
    setActive(0);
  }, [q, projectKey]);

  if (!open) return null;

  const go = (i: number) => {
    const row = rows[i];
    if (!row) return;
    row.run();
    setOpen(false);
  };

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: color.overlay }}
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 112,
          left: 16,
          right: 16,
          margin: '0 auto',
          maxWidth: 620,
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: 14,
          boxShadow: color.shadow,
          overflow: 'hidden',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${color.divider}`, color: color.muted }}>
          {project && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', borderRadius: 6, background: color.brandTint, color: color.brandStrong, fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: project.color }} />
              {project.name}
            </span>
          )}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search"
            aria-label="Type a command or search"
            style={{ flex: 1, minWidth: 0, border: 0, font: 'inherit', fontSize: 16, color: color.ink, outline: 'none' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Tab') {
                e.preventDefault();
                if (!projects.length) return;
                const cycle: Array<string | null> = [null, ...projects.map((p) => p.key)];
                const at = Math.max(0, cycle.indexOf(projectKey));
                const step = e.shiftKey ? cycle.length - 1 : 1;
                setProjectKey(cycle[(at + step) % cycle.length] ?? null);
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(rows.length - 1, a + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === 'Enter') go(active);
            }}
          />
          <kbd className="bt-kbd">Esc</kbd>
        </label>
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tasks.length > 0 && <div className="bt-nav-heading" style={{ paddingTop: 8 }}>Tasks{project ? ` in ${project.name}` : ''}</div>}
          {project && q.trim().length >= 2 && tasks.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 13, color: color.muted }}>No tasks in {project.name}.</div>
          )}
          {tasks.map((t, i) => {
            const parts = highlightParts(t.title, q);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => go(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 40,
                  padding: '0 10px',
                  border: 0,
                  borderRadius: 8,
                  background: active === i ? color.brandTint : 'transparent',
                  color: color.ink,
                  font: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 12, color: color.muted, width: 58 }}>{t.key}</span>
                <span style={{ flex: 1 }}>
                  {parts.pre}
                  {parts.hit ? <mark className="bt-hit">{parts.hit}</mark> : null}
                  {parts.post}
                </span>
                <span style={{ fontSize: 12, color: color.muted }}>{t.statusName}</span>
                {active === i ? <kbd className="bt-kbd">↵</kbd> : null}
              </button>
            );
          })}
          <div className="bt-nav-heading" style={{ padding: '10px 10px 4px' }}>Actions</div>
          {actions.map((a, i) => {
            const idx = tasks.length + i;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => go(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 40,
                  padding: '0 10px',
                  border: 0,
                  borderRadius: 8,
                  background: active === idx ? color.brandTint : 'transparent',
                  color: color.ink,
                  font: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ flex: 1 }}>{a.label}</span>
                {a.hint ? <span style={{ fontSize: 12, color: color.muted }}>{a.hint}</span> : null}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 16, padding: '10px 18px', background: color.subtle, borderTop: `1px solid ${color.divider}`, fontSize: 12, color: color.muted, whiteSpace: 'nowrap' }}>
          <span>↑ ↓ to move</span>
          <span>↵ to open</span>
          <span>Tab to filter by project</span>
        </div>
      </div>
    </div>
  );
}
