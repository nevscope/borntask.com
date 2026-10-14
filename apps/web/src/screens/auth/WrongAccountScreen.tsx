import { Alert, Button } from 'antd';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { AuthFrame } from './AuthFrame';

export function WrongAccountScreen() {
  const { token = '' } = useParams();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setError(null);
    const res = await fetch(`${BASE_URL}/invites/${encodeURIComponent(token)}/wrong-account`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ message: 'Could not send the request' }));
      setError((json as { message?: string }).message ?? 'Could not send the request');
      return;
    }
    setSent(true);
  };

  return (
    <AuthFrame title="This invitation is for a different email">
      <p>You are signed in with an account that does not match the invited address.</p>
      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} />}
      {sent ? (
        <Alert type="success" message="The person who invited you has been asked to send an invite to this address." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button type="primary" onClick={() => void ask()}>Ask for an invite to this address</Button>
          <Button href="/sign-in">Switch account</Button>
        </div>
      )}
      <p style={{ marginTop: 16, fontSize: 13 }}><Link to="/sign-in">Back to sign in</Link></p>
    </AuthFrame>
  );
}
