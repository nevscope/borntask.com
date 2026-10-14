import { Modal } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../api/queries';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const projects = useProjects().data ?? [];
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = [
      { id: 'my', label: 'My tasks', to: '/' },
      { id: 'search', label: 'Search', to: n ? `/search?q=${encodeURIComponent(q)}` : '/search' },
      { id: 'projects', label: 'Projects', to: '/projects' },
      { id: 'import', label: 'Import from Asana', to: '/import' },
      { id: 'people', label: 'People and invitations', to: '/settings/people' },
      { id: 'defaults', label: 'Roles, types and workflows', to: '/settings/defaults' },
      { id: 'ws', label: 'Workspace general', to: '/settings/workspace' },
      { id: 'wf', label: 'Workflow editor', to: '/settings/workflow' },
      ...projects.map((p) => ({ id: p.key, label: `Project · ${p.name}`, to: `/p/${p.key}/list` })),
    ];
    if (!n) return list;
    return list.filter((i) => i.label.toLowerCase().includes(n) || i.id.toLowerCase().includes(n));
  }, [q, projects]);

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      title="Jump to"
      destroyOnHidden
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Projects, My tasks, search…"
        aria-label="Command palette"
        style={{ width: '100%', height: 40, border: '1px solid #E8EBE6', borderRadius: 8, padding: '0 12px', font: 'inherit' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items[0]) {
            navigate(items[0].to);
            setOpen(false);
          }
        }}
      />
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.slice(0, 8).map((i) => (
          <button
            key={i.id}
            type="button"
            className="bt-row-title"
            style={{ padding: '8px 4px' }}
            onClick={() => {
              navigate(i.to);
              setOpen(false);
            }}
          >
            {i.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
