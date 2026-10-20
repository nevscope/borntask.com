import { Alert, Button } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { color, font } from '../../theme/tokens';
import { AuthFrame } from './AuthFrame';

type InviteInfo = {
  email: string;
  invitedBy: string;
  signedInEmail: string | null;
};

export function WrongAccountScreen() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${BASE_URL}/invites/${encodeURIComponent(token)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setMissing(true);
          return;
        }
        setInfo(await res.json() as InviteInfo);
      })
      .catch(() => setMissing(true));
  }, [token]);

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

  const signedIn = info?.signedInEmail ?? 'this address';

  return (
    <AuthFrame
      title="This invitation is for another email address"
      eyebrow={<span style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: color.warningTint, color: color.warning }}>Different account</span>}
    >
      {missing && <Alert type="error" message="This invitation was not found." />}
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 10, padding: '14px 16px', borderRadius: 10, background: color.subtle, border: `1px solid ${color.divider}`, fontSize: 13.5 }}>
        <dt style={{ color: color.muted }}>Invited</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{info?.email ?? 'Unknown'}</dd>
        <dt style={{ color: color.muted }}>Signed in as</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{info?.signedInEmail ?? 'Unknown'}</dd>
      </dl>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: color.ink3 }}>
        Nothing has been joined. Sign in with the invited address, or ask {info?.invitedBy ?? 'the person who invited you'} to send the invitation to the address you use.
      </p>
      {error && <Alert type="error" message={error} />}
      {sent ? (
        <Alert type="success" message={`${info?.invitedBy ?? 'They'} will get a request in BornTask. You'll get a new invitation as soon as it's approved.`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button href="/sign-in" type="primary" style={{ height: 46, fontWeight: 600 }}>Switch account</Button>
          <Button onClick={() => void ask()} disabled={missing} style={{ height: 46, fontWeight: 600 }}>
            Ask for an invitation to {signedIn}
          </Button>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 13 }}><Link to="/sign-in" style={{ fontFamily: font.ui }}>Back to sign in</Link></p>
    </AuthFrame>
  );
}
