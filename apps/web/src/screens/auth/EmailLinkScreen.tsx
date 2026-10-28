import { Button, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { AuthFrame } from './AuthFrame';

/**
 * One-tap link from the sign-in email. The token is spent by POST only, so
 * inbox scanners that prefetch GET do not use it up.
 */
export function EmailLinkScreen() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(token ? null : 'This sign-in link is incomplete.');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void fetch(`${BASE_URL}/auth/email/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { redirect?: string; message?: string } | null;
        if (res.ok && json?.redirect) {
          window.location.assign(json.redirect);
          return;
        }
        setError('This link has expired or was already used. Send yourself a new code.');
      })
      .catch(() => {
        setError('This link has expired or was already used. Send yourself a new code.');
      });
  }, [token]);

  return (
    <AuthFrame title={error ? 'Link did not work' : 'Signing you in'} eyebrow={<p style={{ margin: 0 }}>Sign in</p>}>
      {error ? (
        <>
          <p role="alert" style={{ margin: 0 }}>
            {error}
          </p>
          <Link to="/sign-in">
            <Button type="primary" block style={{ height: 48, borderRadius: 10, fontWeight: 600 }}>
              Back to sign in
            </Button>
          </Link>
        </>
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <Spin size="large" />
        </div>
      )}
    </AuthFrame>
  );
}
