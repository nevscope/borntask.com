import { Button, Checkbox, Form, Input } from 'antd';
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

const WORKFLOWS = [
  {
    id: 'delivery' as const,
    title: 'Software delivery',
    detail: 'Idea → Approved → WIP → Ready for testing → Testing → Deployed, with roles',
  },
  {
    id: 'simple' as const,
    title: 'Simple tasks',
    detail: 'To do → Doing → Done, anyone can move tasks',
  },
];

function WorkflowChoice({ value, onChange }: { value?: 'delivery' | 'simple'; onChange?: (value: 'delivery' | 'simple') => void }) {
  return (
    <div role="radiogroup" aria-label="How does your team work?" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {WORKFLOWS.map((option) => {
        const on = value === option.id;
        return (
          <label
            key={option.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 14px',
              border: `1px solid ${on ? color.brandBorder : color.border}`,
              borderRadius: 10,
              background: on ? color.brandTint : color.surface,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="workflow"
              checked={on}
              onChange={() => onChange?.(option.id)}
              style={{ width: 16, height: 16, marginTop: 2 }}
            />
            <span>
              <span style={{ display: 'block', fontWeight: 600 }}>{option.title}</span>
              <span style={{ fontSize: 12.5, color: on ? color.ink3 : color.muted }}>{option.detail}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

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
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
              initialValues={{ ...values, joinDomain: Boolean(values.allowedDomain) }}
              onFinish={(v: Draft & { joinDomain?: boolean }) => next({
                name: v.name,
                slug: v.slug,
                workflow: v.workflow,
                allowedDomain: v.joinDomain && domain ? domain : '',
              })}
            >
              <h1 className="bt-h1">Set up your workspace</h1>
              <p style={{ margin: 0, fontSize: 14, color: color.ink3 }}>A workspace holds your team, projects and settings. You can change all of this later.</p>
              <Form.Item name="name" label="Company or team name" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input style={{ height: 42, fontSize: 15 }} />
              </Form.Item>
              <Form.Item name="slug" label="Web address" extra={slugNote} style={{ marginBottom: 0 }}>
                <Input className="bt-domain" addonAfter=".borntask.com" placeholder="acme" onBlur={(e) => void checkSlug(e.target.value)} styles={{ input: { height: 42, fontSize: 15 } }} />
              </Form.Item>
              <Form.Item name="workflow" label="How does your team work?" style={{ marginBottom: 0 }}>
                <WorkflowChoice />
              </Form.Item>
              {domain && (
                <Form.Item name="joinDomain" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Checkbox className="bt-check-row" style={{ gap: 10 }}>Let anyone with an @{domain} Google or Microsoft account join without an invitation</Checkbox>
                </Form.Item>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" htmlType="submit" style={{ height: 42, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Continue</Button>
              </div>
            </Form>
          )}
          {step === 1 && (
            <Form layout="vertical" style={{ display: 'flex', flexDirection: 'column', gap: 18 }} initialValues={{ inviteEmails: values.inviteEmails }} onFinish={(v: { inviteEmails?: string }) => next({ inviteEmails: v.inviteEmails ?? '' })}>
              <h1 className="bt-h1">Invite your team</h1>
              <p style={{ margin: 0, fontSize: 14, color: color.ink3 }}>Optional. An email outside your domain is invited as a guest.</p>
              <Form.Item name="inviteEmails" label="Teammate emails (comma-separated)" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button type="primary" htmlType="submit" style={{ height: 42, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Continue</Button>
              </div>
            </Form>
          )}
          {step === 2 && (
            <Form
              layout="vertical"
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
              initialValues={{ firstProjectName: values.firstProjectName }}
              onFinish={(v: { firstProjectName?: string }) => void create({ firstProjectName: v.firstProjectName ?? '' })}
            >
              <h1 className="bt-h1">First project</h1>
              <Form.Item name="firstProjectName" label="Project name (optional)" style={{ marginBottom: 0 }}>
                <Input placeholder="Website" style={{ height: 42, fontSize: 15 }} />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setStep(1)}>Back</Button>
                <Button type="primary" htmlType="submit" loading={busy} style={{ height: 42, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Create workspace</Button>
              </div>
            </Form>
          )}
        </section>
      </div>
    </div>
  );
}
