import { Button, Checkbox, Form, Input, Radio } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { Logo } from '../../components/Logo';
import { color } from '../../theme/tokens';

const STEPS = ['Your workspace', 'Invite your team', 'First project'];

type Draft = {
  name: string;
  slug: string;
  workflow: 'delivery' | 'simple';
  allowedDomain: string;
  inviteEmails: string;
  firstProjectName: string;
};

export function CreateWorkspaceScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [slugNote, setSlugNote] = useState<string | null>(null);
  const [values, setValues] = useState<Draft>({
    name: '',
    slug: '',
    workflow: 'delivery',
    allowedDomain: '',
    inviteEmails: '',
    firstProjectName: '',
  });

  const domain = email.split('@')[1] ?? '';

  useEffect(() => {
    void fetch(`${BASE_URL}/me`, { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 401) {
          navigate('/sign-in', { replace: true });
          return;
        }
        const json = await r.json() as { user?: { email?: string } };
        setEmail(json.user?.email ?? '');
      })
      .catch(() => navigate('/sign-in', { replace: true }));
  }, [navigate]);

  const next = (patch: Partial<Draft>) => {
    setValues((v) => ({ ...v, ...patch }));
    setStep((s) => Math.min(2, s + 1));
  };

  const checkSlug = async (raw: string) => {
    const slug = raw.trim();
    if (slug.length < 2) {
      setSlugNote(null);
      return;
    }
    const res = await fetch(`${BASE_URL}/workspaces/slug-available?slug=${encodeURIComponent(slug)}`, { credentials: 'include' });
    const json = await res.json() as { available?: boolean; message?: string };
    if (!res.ok) {
      setSlugNote(json.message ?? null);
      return;
    }
    setSlugNote(json.available ? 'Available' : 'That address is taken. A short suffix will be added.');
  };

  const create = async (patch: Partial<Draft> = {}) => {
    const nextValues = { ...values, ...patch };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/workspaces`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nextValues.name,
          slug: nextValues.slug || undefined,
          workflow: nextValues.workflow,
          allowedDomain: nextValues.allowedDomain || undefined,
          inviteEmails: nextValues.inviteEmails.split(/[,;\s]+/).filter(Boolean),
          firstProjectName: nextValues.firstProjectName || undefined,
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
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create workspace');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', padding: '40px 24px 56px', background: color.canvas, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      <div style={{ width: '100%', maxWidth: 980, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <Logo />
        <span style={{ flex: 1 }} />
        {email && <span style={{ fontSize: 13, color: color.muted }}>Signed in as {email}</span>}
      </div>
      <div style={{ width: '100%', maxWidth: 980, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <ol style={{ flex: '1 1 220px', maxWidth: 260, listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 40,
                padding: '0 12px',
                borderRadius: 10,
                background: i === step ? color.surface : 'transparent',
                border: i === step ? `1px solid ${color.brandBorder}` : '1px solid transparent',
                fontWeight: i === step ? 600 : 400,
                color: i === step ? color.ink : color.muted,
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: i === step ? color.brand : color.border, color: i === step ? color.surface : color.ink3, fontSize: 12,
              }}>{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <section style={{ flex: '999 1 520px', background: color.surface, border: `1px solid ${color.border}`, borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {error && <p style={{ color: color.danger, margin: 0 }}>{error}</p>}
          {step === 0 && (
            <Form
              layout="vertical"
              initialValues={{ ...values, joinDomain: Boolean(values.allowedDomain) }}
              onFinish={(v: Draft & { joinDomain?: boolean }) => next({
                name: v.name,
                slug: v.slug,
                workflow: v.workflow,
                allowedDomain: v.joinDomain && domain ? domain : '',
              })}
            >
              <h1 className="bt-h1">Set up your workspace</h1>
              <p style={{ margin: '8px 0 16px', fontSize: 14, color: color.ink3 }}>A workspace holds your team, projects and settings. You can change all of this later.</p>
              <Form.Item name="name" label="Company or team name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="slug" label="Web address" extra={slugNote}>
                <Input addonAfter=".borntask.com" placeholder="acme" onBlur={(e) => void checkSlug(e.target.value)} />
              </Form.Item>
              <Form.Item name="workflow" label="How does your team work?">
                <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Radio value="delivery">Software delivery - Idea to Deployed, with roles</Radio>
                  <Radio value="simple">Simple tasks - To do, Doing, Done</Radio>
                </Radio.Group>
              </Form.Item>
              {domain && (
                <Form.Item name="joinDomain" valuePropName="checked">
                  <Checkbox>Let anyone with an @{domain} Google or Microsoft account join without an invitation</Checkbox>
                </Form.Item>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" htmlType="submit">Continue</Button>
              </div>
            </Form>
          )}
          {step === 1 && (
            <Form layout="vertical" initialValues={{ inviteEmails: values.inviteEmails }} onFinish={(v: { inviteEmails?: string }) => next({ inviteEmails: v.inviteEmails ?? '' })}>
              <h1 className="bt-h1">Invite your team</h1>
              <p style={{ margin: '8px 0 0', fontSize: 14, color: color.ink3 }}>Optional. An email outside your domain is invited as a guest.</p>
              <Form.Item name="inviteEmails" label="Teammate emails (comma-separated)">
                <Input.TextArea rows={3} />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button type="primary" htmlType="submit">Continue</Button>
              </div>
            </Form>
          )}
          {step === 2 && (
            <Form
              layout="vertical"
              initialValues={{ firstProjectName: values.firstProjectName }}
              onFinish={(v: { firstProjectName?: string }) => void create({ firstProjectName: v.firstProjectName ?? '' })}
            >
              <h1 className="bt-h1">First project</h1>
              <Form.Item name="firstProjectName" label="Project name (optional)">
                <Input placeholder="Website" />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setStep(1)}>Back</Button>
                <Button type="primary" htmlType="submit" loading={busy}>Create workspace</Button>
              </div>
            </Form>
          )}
        </section>
      </div>
    </div>
  );
}
