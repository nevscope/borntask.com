import { Alert, Button } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import { Logo } from '../../components/Logo';
import { storeWelcome } from '../../lib/welcome';
import { color, font } from '../../theme/tokens';

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
      const json = await res.json() as {
        welcome?: string;
        message?: string;
        workspaceName?: string;
        projectName?: string | null;
        projectKey?: string | null;
        projectRole?: string | null;
      };
      if (!res.ok) throw new Error(json.message ?? 'Could not accept');
      const kind = json.welcome === 'guest' ? 'guest' : 'member';
      storeWelcome({
        kind,
        workspaceName: json.workspaceName ?? '',
        projectName: json.projectName ?? null,
        projectKey: json.projectKey ?? null,
        projectRole: json.projectRole ?? null,
      });
      navigate(kind === 'guest' ? '/welcome/guest' : '/welcome/member', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', padding: '40px 24px 56px', background: color.canvas, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
      <Logo />
      <section style={{ width: '100%', maxWidth: 460, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!info && !error && <p style={{ margin: 0, color: color.muted }}>Loading invitation…</p>}
        {error && <Alert type="error" message={error} />}
        {info && (
          <>
            <div>
              <h1 style={{ margin: 0, fontFamily: font.display, fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.3 }}>
                {info.invitedBy} invited you{info.projectName ? ` to ${info.projectName}` : ''}
              </h1>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, color: color.ink3 }}>
                at {info.workspaceName}, as <strong>{info.tenantRole}</strong>. Sign in as <strong>{info.email}</strong> to accept.
              </p>
            </div>
            {info.expired ? (
              <>
                <span style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: color.dangerTint, color: color.danger }}>Expired</span>
                <Alert type="warning" message="This invitation has expired. Ask the person who invited you for a new one." />
              </>
            ) : !info.signedInEmail ? (
              <Button type="primary" size="large" href={`/sign-in?invite=${encodeURIComponent(token)}`}>
                Sign in to accept
              </Button>
            ) : (
              <Button type="primary" size="large" loading={busy} onClick={() => void accept()}>
                Accept invitation
              </Button>
            )}
            <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>
              Already have access? <Link to="/sign-in">Sign in</Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
