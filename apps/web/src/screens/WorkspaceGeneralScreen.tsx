import { Alert, Button, Checkbox, Form, Input, Select } from 'antd';
import { useEffect } from 'react';
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
  workflows: { id: string; name: string; slug: string }[];
};

export function WorkspaceGeneralScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const qc = useQueryClient();
  const [form] = Form.useForm();
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

  return (
    <SettingsFrame canAdmin={canAdmin}>
      <h1 className="bt-h1">Workspace</h1>
      <p style={{ color: color.muted }}>Owners and admins only.</p>
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
        <Form.Item name="name" label="Workspace name"><Input /></Form.Item>
        <Form.Item name="slug" label="Web address"><Input addonAfter=".borntask.com" /></Form.Item>
        <Form.Item name="timeZone" label="Default time zone">
          <Select options={['Europe/Malta', 'Europe/London', 'UTC'].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="weekStart" label="Week starts on">
          <Select options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} />
        </Form.Item>
        <Form.Item name="defaultWorkflowId" label="Default workflow for new projects">
          <Select options={(ws.data?.workflows ?? []).map((w) => ({ value: w.id, label: w.name }))} />
        </Form.Item>
        <Form.Item name="bugsStartIn" label="Bugs start in">
          <Select options={[
            { value: 'approved', label: 'Approved (skip approval)' },
            { value: 'idea', label: 'Idea (needs approval)' },
          ]}
          />
        </Form.Item>
        <Form.Item name="allowGoogle" valuePropName="checked"><Checkbox>Allow sign-in with Google</Checkbox></Form.Item>
        <Form.Item name="allowMicrosoft" valuePropName="checked"><Checkbox>Allow sign-in with Microsoft</Checkbox></Form.Item>
        <Form.Item name="membersCanInviteGuests" valuePropName="checked"><Checkbox>Members can invite guests</Checkbox></Form.Item>
        <Button type="primary" htmlType="submit">Save</Button>
      </Form>
    </SettingsFrame>
  );
}
