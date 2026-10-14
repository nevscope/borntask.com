import { Alert, Button } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { AuthFrame } from './AuthFrame';

type InviteInfo = {
  email: string;
  workspaceName: string;
  invitedBy: string;
  tenantRole: string;
  projectName: string | null;
  expired: boolean;
  accepted: boolean;
  signedInEmail: string | null;
  wrongAccount: boolean;
};

export function AcceptInviteScreen() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`${BASE_URL}/invites/${encodeURIComponent(token)}`, { credentials: 'include' })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.message ?? 'Invite failed');
        setInfo(json as InviteInfo);
        if ((json as InviteInfo).wrongAccount) navigate(`/invite/${token}/wrong-account`, { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [token, navigate]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json() as { welcome?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? 'Could not accept');
      navigate(json.welcome === 'guest' ? '/welcome/guest' : '/welcome/member', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setBusy(false);
    }
  };

  if (!info && !error) return <AuthFrame title="Invitation">Loading…</AuthFrame>;

  return (
    <AuthFrame title="Join this workspace">
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      {info && (
        <>
          <p style={{ marginTop: 0 }}>
            {info.invitedBy} invited <strong>{info.email}</strong> to {info.workspaceName}
            {info.projectName ? ` on ${info.projectName}` : ''}.
          </p>
          {info.expired ? (
            <Alert type="warning" message="This invitation has expired. Ask the person who invited you for a new one." />
          ) : !info.signedInEmail ? (
            <Button type="primary" href={`/sign-in?invite=${encodeURIComponent(token)}`}>
              Sign in to accept
            </Button>
          ) : (
            <Button type="primary" loading={busy} onClick={() => void accept()}>
              Accept invitation
            </Button>
          )}
          <p style={{ marginTop: 16, fontSize: 13 }}>
            <Link to="/sign-in">Use a different account</Link>
          </p>
        </>
      )}
    </AuthFrame>
  );
}
