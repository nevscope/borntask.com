import { Button, Form, Input, Select } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk } from '../api/queries';
import type { User, WorkspaceRole } from '../api/types';
import { color } from '../theme/tokens';

type Person = User & { workspaceRole: WorkspaceRole };

export function CreateProjectScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const people = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/people`, { credentials: 'include' });
      if (!res.ok) return [] as Person[];
      return (await res.json()) as Person[];
    },
  });

  return (
    <div className="bt-page" style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <h1 className="bt-h1">New project</h1>
      <p style={{ color: color.muted }}>Name, key, workflow, first sections and who is on it.</p>
      {error && <p style={{ color: color.danger }}>{error}</p>}
      <Form
        layout="vertical"
        onFinish={async (v: { name: string; key?: string; workflow: 'delivery' | 'simple'; sections?: string; memberIds?: string[] }) => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`${BASE_URL}/projects`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: v.name,
                key: v.key || undefined,
                workflow: v.workflow,
                sections: (v.sections ?? '').split(/\n/).map((s) => s.trim()).filter(Boolean),
                memberIds: v.memberIds,
              }),
            });
            const json = await res.json() as { message?: string; project?: { key: string } };
            if (!res.ok) throw new Error(json.message ?? 'Could not create project');
            void qc.invalidateQueries({ queryKey: qk.projects });
            navigate(`/p/${json.project?.key ?? v.key}/list`);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create project');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form.Item name="name" label="Project name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="key" label="Key">
          <Input maxLength={6} placeholder="HLP" style={{ maxWidth: 120, letterSpacing: '0.04em' }} />
        </Form.Item>
        <Form.Item name="workflow" label="Workflow" initialValue="delivery">
          <Select
            options={[
              { value: 'delivery', label: 'Delivery: Idea to Deployed, plus On hold and Rejected' },
              { value: 'simple', label: 'Simple: To do, Doing, Done' },
            ]}
          />
        </Form.Item>
        <Form.Item name="sections" label="Initial sections" extra="One name per line. Inbox is used if you leave this empty.">
          <Input.TextArea rows={4} placeholder={'Inbox\nThis week\nLater'} />
        </Form.Item>
        <Form.Item name="memberIds" label="Members">
          <Select
            mode="multiple"
            placeholder="Add people already in the workspace"
            options={(people.data ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.email})` }))}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>Create project</Button>
      </Form>
    </div>
  );
}
