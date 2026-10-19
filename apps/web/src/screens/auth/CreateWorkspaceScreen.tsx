import { workspacePackById, workspacePacks, type WorkspacePack, type WorkspacePackId } from '@borntask/shared';
import { Button, Checkbox, Form, Input } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { Logo } from '../../components/Logo';
import { categoryBar, chipFromHex, color } from '../../theme/tokens';

const STEPS = ['Your workspace', 'How you will work', 'Invite your team', 'First project'];

type Draft = {
  name: string;
  slug: string;
  pack: WorkspacePackId;
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
  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [slugNote, setSlugNote] = useState<string | null>(null);
  const [values, setValues] = useState<Draft>({
    name: '',
    slug: '',
    pack: 'software',
    allowedDomain: '',
    inviteEmails: '',
    firstProjectName: '',
  });

  const domain = email.split('@')[1] ?? '';
  const pack = workspacePackById(values.pack);

  useEffect(() => {
    void fetch(`${BASE_URL}/me`, { credentials: 'include' })
      .then(async (r) => {
        if (r.status === 401) {
          navigate('/sign-in', { replace: true });
          return;
        }
        const json = await r.json() as { user?: { email?: string }; workspaces?: { id: string }[] };
        setEmail(json.user?.email ?? '');
        setHasWorkspace((json.workspaces ?? []).length > 0);
      })
      .catch(() => navigate('/sign-in', { replace: true }));
  }, [navigate]);

  const cancel = () => {
    if (hasWorkspace) {
      navigate('/');
      return;
    }
    void fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).then(() => {
      window.location.href = '/sign-in';
    });
  };

  const next = (patch: Partial<Draft>) => {
    setValues((v) => ({ ...v, ...patch }));
    setStep((s) => Math.min(3, s + 1));
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
          pack: nextValues.pack,
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
      window.location.href = '/settings/defaults';
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
              {domain && (
                <Form.Item name="joinDomain" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Checkbox className="bt-check-row" style={{ gap: 10 }}>Let anyone with an @{domain} Google or Microsoft account join without an invitation</Checkbox>
                </Form.Item>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button htmlType="button" onClick={cancel} style={{ height: 42, borderRadius: 10, fontSize: 14 }}>Cancel</Button>
                <Button type="primary" htmlType="submit" style={{ height: 42, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Continue</Button>
              </div>
            </Form>
          )}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h1 className="bt-h1">How will you use this workspace?</h1>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: color.ink3 }}>We will set up roles, task types and a workflow to match. You can amend them after you create the workspace.</p>
              </div>
              <div role="radiogroup" aria-label="Workspace template" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {workspacePacks.map((option) => {
                  const on = values.pack === option.id;
                  return (
                    <label
                      key={option.id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        padding: '12px 14px',
                        border: `1px solid ${on ? color.brandBorder : color.border}`,
                        borderRadius: 10,
                        background: on ? color.brandTint : color.surface,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="pack"
                        checked={on}
                        onChange={() => setValues((v) => ({ ...v, pack: option.id }))}
                        style={{ width: 16, height: 16, marginTop: 2 }}
                      />
                      <span>
                        <span style={{ display: 'block', fontWeight: 600 }}>{option.title}</span>
                        <span style={{ fontSize: 12.5, color: on ? color.ink3 : color.muted }}>{option.summary}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <PackPreview pack={pack} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button type="primary" onClick={() => next({})} style={{ height: 42, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Continue</Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <Form layout="vertical" style={{ display: 'flex', flexDirection: 'column', gap: 18 }} initialValues={{ inviteEmails: values.inviteEmails }} onFinish={(v: { inviteEmails?: string }) => next({ inviteEmails: v.inviteEmails ?? '' })}>
              <h1 className="bt-h1">Invite your team</h1>
              <p style={{ margin: 0, fontSize: 14, color: color.ink3 }}>Optional. An email outside your domain is invited as a guest.</p>
              <Form.Item name="inviteEmails" label="Teammate emails (comma-separated)" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setStep(1)}>Back</Button>
                <Button type="primary" htmlType="submit" style={{ height: 42, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Continue</Button>
              </div>
            </Form>
          )}
          {step === 3 && (
            <Form
              layout="vertical"
              style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
              initialValues={{ firstProjectName: values.firstProjectName }}
              onFinish={(v: { firstProjectName?: string }) => void create({ firstProjectName: v.firstProjectName ?? '' })}
            >
              <h1 className="bt-h1">First project</h1>
              <p style={{ margin: 0, fontSize: 14, color: color.ink3 }}>Optional. After create you land on roles, types and workflows so you can amend the {pack.title.toLowerCase()} template.</p>
              <Form.Item name="firstProjectName" label="Project name (optional)" style={{ marginBottom: 0 }}>
                <Input placeholder="Website" style={{ height: 42, fontSize: 15 }} />
              </Form.Item>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => setStep(2)}>Back</Button>
                <Button type="primary" htmlType="submit" loading={busy} style={{ height: 42, borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Create workspace</Button>
              </div>
            </Form>
          )}
        </section>
      </div>
    </div>
  );
}

function PackPreview({ pack }: { pack: WorkspacePack }) {
  const workflow = pack.workflows.find((item) => item.isDefault) ?? pack.workflows[0];
  const stages = (workflow?.stages ?? []).filter((stage) => stage.position < 90);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, border: `1px solid ${color.divider}`, borderRadius: 12, background: color.subtle }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>We will set up</span>
      <PreviewRow label="Roles">
        {pack.roles.map((role) => <Chip key={role.slug} label={role.name} colour={role.colour} />)}
      </PreviewRow>
      <PreviewRow label="Types">
        {pack.types.map((type) => <Chip key={type.slug} label={type.name} colour={type.colour} />)}
      </PreviewRow>
      <PreviewRow label={workflow?.name ?? 'Workflow'}>
        {stages.map((stage, i) => (
          <span key={stage.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: color.ink3 }}>
            {i > 0 && <span style={{ color: color.muted }}>{'>'}</span>}
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: categoryBar[stage.category] }} />
            {stage.name}
          </span>
        ))}
      </PreviewRow>
    </div>
  );
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 72, fontSize: 12, color: color.muted }}>{label}</span>
      {children}
    </div>
  );
}

function Chip({ label, colour }: { label: string; colour: string }) {
  const s = chipFromHex(colour, label);
  return (
    <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.fg }}>{label}</span>
  );
}
