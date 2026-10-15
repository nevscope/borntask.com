import { Alert, Button, Checkbox, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useMe } from '../api/queries';
import { SettingsFrame } from '../components/SettingsNav';
import { color } from '../theme/tokens';

type WorkspaceSettings = {
  name: string;
  slug: string;
  timeZone: string;
  weekStart: 'monday' | 'sunday';
  defaultWorkflowId: string | null;
  bugsStartIn: 'approved' | 'idea';
  allowGoogle: boolean;
  allowMicrosoft: boolean;
  membersCanInviteGuests: boolean;
  logo?: boolean;
  workflows: { id: string; name: string; slug: string }[];
};

export function WorkspaceGeneralScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [logoVersion, setLogoVersion] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isOwner = me?.workspaceRole === 'owner';
  const ws = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/workspace`, { credentials: 'include' });
      if (!res.ok) throw new Error('Sign in to load workspace settings.');
      return (await res.json()) as WorkspaceSettings;
    },
  });

  useEffect(() => {
    if (ws.data) form.setFieldsValue(ws.data);
  }, [ws.data, form]);

  const initials = (ws.data?.name ?? me?.workspace.name ?? 'BT')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">Workspace</h1>
      <p style={{ color: color.muted, margin: '6px 0 0' }}>Owners and admins only.</p>
      {!canAdmin && <Alert type="warning" message="You can view this page, but only an owner or admin can save changes." />}
      {ws.error && <Alert type="error" message={ws.error.message} />}
      <Form
        form={form}
        layout="vertical"
        disabled={!canAdmin}
        onFinish={async (values) => {
          const res = await fetch(`${BASE_URL}/workspace`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          });
          if (!res.ok) return;
          void qc.invalidateQueries({ queryKey: qk.me });
          void qc.invalidateQueries({ queryKey: ['workspace-settings'] });
        }}
      >
        <section className="bt-card" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {ws.data?.logo ? (
              <img src={`${BASE_URL}/workspace/logo?v=${logoVersion}`} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover' }} />
            ) : (
              <span style={{ width: 64, height: 64, borderRadius: 14, display: 'grid', placeItems: 'center', background: color.brand, color: color.surface, fontSize: 20, fontWeight: 600 }}>{initials}</span>
            )}
            <label style={{ height: 30, padding: '0 10px', display: 'inline-flex', alignItems: 'center', border: `1px solid ${color.border}`, borderRadius: 8, background: color.surface, fontSize: 12.5, cursor: canAdmin ? 'pointer' : 'default' }}>
              Upload logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!canAdmin}
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const body = new FormData();
                  body.append('file', file);
                  void fetch(`${BASE_URL}/workspace/logo`, { method: 'POST', credentials: 'include', body }).then(async (res) => {
                    if (!res.ok) return;
                    setLogoVersion((n) => n + 1);
                    void qc.invalidateQueries({ queryKey: ['workspace-settings'] });
                  });
                }}
              />
            </label>
          </div>
          <div style={{ flex: '1 1 360px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Form.Item name="name" label="Workspace name" style={{ marginBottom: 0 }}><Input /></Form.Item>
            <Form.Item name="slug" label="Web address" style={{ marginBottom: 0 }}><Input addonAfter=".borntask.com" /></Form.Item>
            <Form.Item name="timeZone" label="Default time zone" style={{ marginBottom: 0 }}>
              <Select options={['Europe/Malta', 'Europe/London', 'UTC'].map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="weekStart" label="Week starts on" style={{ marginBottom: 0 }}>
              <Select options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} />
            </Form.Item>
            <Form.Item name="defaultWorkflowId" label="Default workflow for new projects" style={{ marginBottom: 0 }}>
              <Select options={(ws.data?.workflows ?? []).map((w) => ({ value: w.id, label: w.name }))} />
            </Form.Item>
            <Form.Item name="bugsStartIn" label="Bugs start in" style={{ marginBottom: 0 }}>
              <Select options={[
                { value: 'approved', label: 'Approved (skip approval)' },
                { value: 'idea', label: 'Idea (needs approval)' },
              ]}
              />
            </Form.Item>
          </div>
        </section>
        <section className="bt-card" style={{ padding: '16px 18px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>Security</h2>
          <Form.Item name="allowGoogle" valuePropName="checked" style={{ marginBottom: 8 }}><Checkbox className="bt-check-row">Allow sign-in with Google</Checkbox></Form.Item>
          <Form.Item name="allowMicrosoft" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox className="bt-check-row">Allow sign-in with Microsoft <span style={{ fontSize: 12.5, color: color.muted }}>(needed for most client guests)</span></Checkbox>
          </Form.Item>
          <Form.Item name="membersCanInviteGuests" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox className="bt-check-row">Members can invite guests <span style={{ fontSize: 12.5, color: color.muted }}>(otherwise only admins and project leads)</span></Checkbox>
          </Form.Item>
        </section>
        <Button type="primary" htmlType="submit">Save</Button>
      </Form>
      {isOwner && (
        <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: '1 1 320px' }}>
            <span style={{ display: 'block', fontWeight: 600, color: color.danger }}>Delete workspace</span>
            <span style={{ fontSize: 13, color: color.muted }}>Removes every project, task and file after 30 days. Owners only, and you will be asked to type the workspace name.</span>
          </span>
          <Button danger onClick={() => { setConfirmName(''); setDeleteError(null); setDeleteOpen(true); }}>Delete workspace…</Button>
        </section>
      )}
      <Modal
        title="Delete workspace"
        open={deleteOpen}
        okText="Delete workspace"
        okButtonProps={{ danger: true, disabled: confirmName !== (ws.data?.name ?? '') }}
        onCancel={() => setDeleteOpen(false)}
        onOk={() => {
          setDeleteError(null);
          void fetch(`${BASE_URL}/workspace/delete`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: confirmName }),
          }).then(async (res) => {
            const json = await res.json().catch(() => ({})) as { message?: string; next?: string };
            if (!res.ok) {
              setDeleteError(json.message ?? 'Could not delete the workspace.');
              return;
            }
            window.location.href = json.next ?? '/create-workspace';
          });
        }}
      >
        <p style={{ marginTop: 0 }}>Type <strong>{ws.data?.name}</strong> to close this workspace. It is removed for good after 30 days.</p>
        {deleteError && <Alert type="error" message={deleteError} style={{ marginBottom: 12 }} />}
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label="Workspace name" />
      </Modal>
    </SettingsFrame>
  );
}
