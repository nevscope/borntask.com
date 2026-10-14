import { Button, Form, Input, Radio, Steps } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { AuthFrame } from './AuthFrame';

export function CreateWorkspaceScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    name: '',
    slug: '',
    workflow: 'delivery' as 'delivery' | 'simple',
    allowedDomain: '',
    inviteEmails: '',
    firstProjectName: '',
  });

  const next = (patch: Partial<typeof values>) => {
    setValues((v) => ({ ...v, ...patch }));
    setStep((s) => Math.min(2, s + 1));
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/workspaces`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          slug: values.slug || undefined,
          workflow: values.workflow,
          allowedDomain: values.allowedDomain || undefined,
          inviteEmails: values.inviteEmails.split(/[,;\s]+/).filter(Boolean),
          firstProjectName: values.firstProjectName || undefined,
        }),
      });
      const json = await res.json() as { message?: string };
      if (!res.ok) {
        if (res.status === 401) {
          navigate('/sign-in');
          return;
        }
        throw new Error(json.message ?? 'Could not create workspace');
      }
      navigate('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create workspace');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Create a workspace">
      <Steps current={step} items={[{ title: 'Workspace' }, { title: 'Team' }, { title: 'Project' }]} style={{ marginBottom: 24 }} />
      {error && <p style={{ color: '#B42323' }}>{error}</p>}
      {step === 0 && (
        <Form layout="vertical" initialValues={values} onFinish={(v: typeof values) => next(v)}>
          <Form.Item name="name" label="Workspace name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="slug" label="Web address">
            <Input addonAfter=".borntask.com" placeholder="acme" />
          </Form.Item>
          <Form.Item name="workflow" label="Default workflow">
            <Radio.Group>
              <Radio value="delivery">Delivery (Idea to Deployed)</Radio>
              <Radio value="simple">Simple (To do, Doing, Done)</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="allowedDomain" label="Auto-join email domain (optional)">
            <Input placeholder="company.com" />
          </Form.Item>
          <Button type="primary" htmlType="submit">Continue</Button>
        </Form>
      )}
      {step === 1 && (
        <Form layout="vertical" onFinish={(v: { inviteEmails: string }) => next(v)}>
          <Form.Item name="inviteEmails" label="Invite teammates (comma-separated emails)">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button onClick={() => setStep(0)} style={{ marginRight: 8 }}>Back</Button>
          <Button type="primary" htmlType="submit">Continue</Button>
        </Form>
      )}
      {step === 2 && (
        <Form layout="vertical" onFinish={(v: { firstProjectName: string }) => { setValues((x) => ({ ...x, ...v })); void create(); }}>
          <Form.Item name="firstProjectName" label="First project (optional)">
            <Input placeholder="Website" />
          </Form.Item>
          <Button onClick={() => setStep(1)} style={{ marginRight: 8 }}>Back</Button>
          <Button type="primary" htmlType="submit" loading={busy}>Create workspace</Button>
        </Form>
      )}
    </AuthFrame>
  );
}
