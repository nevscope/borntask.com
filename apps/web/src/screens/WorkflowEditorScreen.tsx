import { Alert, Button, Checkbox, Select, Table } from 'antd';
import { useEffect, useState } from 'react';
import { BASE_URL } from '../api/http';
import { useMe } from '../api/queries';
import type { Transition, Workflow } from '../api/types';

export function WorkflowEditorScreen() {
  const me = useMe().data;
  const canEdit = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [id, setId] = useState<string>('');
  const [rows, setRows] = useState<Transition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch(`${BASE_URL}/workflows`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Workflows need a signed-in session and the API.');
        return r.json();
      })
      .then((list: Workflow[]) => {
        setWorkflows(list);
        const first = list[0];
        if (first) {
          setId(first.id);
          setRows(first.transitions);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const wf = workflows.find((w) => w.id === id);
    if (wf) setRows(wf.transitions);
  }, [id, workflows]);

  const save = async () => {
    setError(null);
    setSaved(false);
    const res = await fetch(`${BASE_URL}/workflows/${encodeURIComponent(id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitions: rows }),
    });
    const json = await res.json() as { message?: string; transitions?: Transition[] };
    if (!res.ok) {
      setError(json.message ?? 'Could not save');
      return;
    }
    if (json.transitions) setRows(json.transitions);
    setSaved(true);
  };

  return (
    <div className="bt-page" style={{ maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <h1 className="bt-h1">Workflow editor</h1>
      <p style={{ color: '#5B6157' }}>Owner and admin only. Transitions decide who may move a task, and whether a comment is required.</p>
      {!canEdit && <Alert type="warning" message="You can view this page, but only an owner or admin can save changes." />}
      {error && <Alert type="error" message={error} />}
      {saved && <Alert type="success" message="Saved." />}
      <Select
        value={id || undefined}
        onChange={setId}
        options={workflows.map((w) => ({ value: w.id, label: w.name }))}
        style={{ minWidth: 240 }}
        placeholder="Choose a workflow"
      />
      <Table
        style={{ marginTop: 16 }}
        rowKey={(r) => `${r.from}-${r.to}-${r.label ?? ''}`}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: 'From', dataIndex: 'from' },
          { title: 'To', dataIndex: 'to' },
          { title: 'Label', dataIndex: 'label' },
          {
            title: 'Comment',
            render: (_, r, i) => (
              <Checkbox
                checked={r.requireComment}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, requireComment: e.target.checked };
                  setRows(next);
                }}
              />
            ),
          },
          { title: 'Roles', render: (_, r) => (r.roles.length ? r.roles.join(', ') : 'Any member') },
        ]}
      />
      <Button type="primary" disabled={!canEdit || !id} onClick={() => void save()} style={{ marginTop: 16 }}>
        Save transitions
      </Button>
    </div>
  );
}
