import { Button, Form, Input } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { AuthFrame } from './AuthFrame';

type Providers = { google: boolean; microsoft: boolean; devLogin: boolean };

export function SignInScreen() {
  const [params] = useSearchParams();
  const invite = params.get('invite') ?? undefined;
  const [providers, setProviders] = useState<Providers>({ google: false, microsoft: false, devLogin: true });
  const [busy, setBusy] = useState(false);

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

  return (
    <AuthFrame title="Sign in to BornTask" footer="Use the same Google or Microsoft account as the email we invited.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button size="large" disabled={!providers.google} onClick={() => start('/auth/google')}>
          Continue with Google
        </Button>
        <Button size="large" disabled={!providers.microsoft} onClick={() => start('/auth/microsoft')}>
          Continue with Microsoft
        </Button>
        {!providers.google && !providers.microsoft && (
          <p style={{ color: '#5B6157', fontSize: 13, margin: 0 }}>
            Production OAuth apps are not configured. Use the local developer sign-in below.
          </p>
        )}
        {providers.devLogin && (
          <Form
            layout="vertical"
            style={{ marginTop: 12 }}
            onFinish={async (values: { email: string; name: string }) => {
              setBusy(true);
              try {
                await fetch(`${BASE_URL}/auth/dev-login`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...values, inviteToken: invite }),
                });
                window.location.href = invite ? `/invite/${invite}` : '/';
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input autoComplete="name" />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input autoComplete="email" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={busy} block>
              Developer sign-in
            </Button>
          </Form>
        )}
        <p style={{ fontSize: 13, margin: '8px 0 0' }}>
          New organisation? <Link to="/create-workspace">Create a workspace</Link> after you sign in.
        </p>
      </div>
    </AuthFrame>
  );
}
