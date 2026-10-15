import { Button, Form, Input } from 'antd';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { useMe } from '../../api/queries';
import { safeNext } from '../../lib/safeNext';
import { LogoMark } from '../../components/Logo';
import { color, font } from '../../theme/tokens';

type Providers = { google: boolean; microsoft: boolean; devLogin: boolean };

export function SignInScreen() {
  const me = useMe();
  const [params] = useSearchParams();
  const invite = params.get('invite') ?? undefined;
  const next = safeNext(params.get('next'));
  const [providers, setProviders] = useState<Providers>({ google: false, microsoft: false, devLogin: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${BASE_URL}/auth/providers`, { credentials: 'include' })
      .then((r) => r.json())
      .then((p: Providers) => setProviders(p))
      .catch(() => undefined);
  }, []);

  const start = (path: string) => {
    const q = invite ? `?invite=${encodeURIComponent(invite)}` : '';
    window.location.href = `${BASE_URL}${path}${q}`;
  };

  if (me.isLoading) {
    return <div style={{ minHeight: '100dvh', background: color.canvas }} aria-busy="true" aria-label="Checking sign-in" />;
  }
  if (me.data) return <Navigate to={next ?? '/'} replace />;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexWrap: 'wrap', background: color.surface }}>
      <section
        style={{
          flex: '1 1 420px',
          minHeight: 360,
          boxSizing: 'border-box',
          padding: '48px 56px',
          background: color.brand,
          color: color.surface,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={26} invert />
          <span style={{ fontFamily: font.display, fontSize: 22, fontWeight: 600, letterSpacing: '-0.035em' }}>borntask</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <svg width="260" height="96" viewBox="0 0 260 96" role="img" aria-label="An idea growing into a finished task">
            <circle cx="24" cy="56" r="9" fill={color.surface} fillOpacity="0.45" />
            <circle cx="72" cy="56" r="14" fill={color.surface} fillOpacity="0.75" />
            <path d="M124 56 L156 86 L236 12" fill="none" stroke={color.surface} strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 style={{ margin: 0, fontFamily: font.display, fontSize: 40, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
            From idea to done,<br />without the drag.
          </h1>
          <p style={{ margin: 0, maxWidth: 420, fontSize: 16, lineHeight: 1.5, color: color.brandOn }}>
            Ideas, bugs, improvements and features in one fast list and board, moving through the workflow your team agreed.
          </p>
        </div>
        <span style={{ fontSize: 13, color: color.brandOnMuted }}>BornTask</span>
      </section>
      <section style={{ flex: '1 1 420px', boxSizing: 'border-box', padding: '48px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }}>Sign in</h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: color.muted }}>Continue with Google or Microsoft. A new account sets up a workspace next.</p>
          </div>
          <OauthButton mark="G" disabled={!providers.google} onClick={() => start('/auth/google')}>Continue with Google</OauthButton>
          <OauthButton mark="M" disabled={!providers.microsoft} onClick={() => start('/auth/microsoft')}>Continue with Microsoft</OauthButton>
          {!providers.google && !providers.microsoft && (
            <p style={{ color: color.muted, fontSize: 13, margin: 0 }}>
              Production OAuth apps are not configured. Use the local developer sign-in below.
            </p>
          )}
          {providers.devLogin && (
            <>
            {error && <p style={{ margin: 0, color: color.danger, fontSize: 13 }}>{error}</p>}
            <Form
              layout="vertical"
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
              onFinish={async (values: { email: string; name: string }) => {
                setBusy(true);
                setError(null);
                try {
                  const res = await fetch(`${BASE_URL}/auth/dev-login`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...values, inviteToken: invite, next }),
                  });
                  const json = await res.json().catch(() => null) as { redirect?: string; message?: string } | null;
                  if (res.ok && json?.redirect) {
                    window.location.href = json.redirect === '/' && next ? next : json.redirect;
                    return;
                  }
                  setError(json?.message ?? 'Could not sign in. Check the API is running on port 3010, then try again.');
                } catch {
                  setError('Could not sign in. Check the API is running on port 3010, then try again.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Form.Item name="name" label="Name" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Input autoComplete="name" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]} style={{ marginBottom: 0 }}>
                <Input autoComplete="email" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={busy} block style={{ height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600 }}>
                Developer sign-in
              </Button>
            </Form>
            </>
          )}
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: color.ink3 }}>
            No invite is required to start. After you sign in with no workspace, you create one. Invites are for adding teammates.
          </p>
        </div>
      </section>
    </div>
  );
}

function OauthButton({ mark, disabled, onClick, children }: { mark: string; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 48,
        border: `1px solid ${color.border}`,
        borderRadius: 10,
        background: color.surface,
        color: disabled ? color.faint : color.ink,
        font: 'inherit',
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: color.chip, fontSize: 12, fontWeight: 700 }}>{mark}</span>
      {children}
    </button>
  );
}
