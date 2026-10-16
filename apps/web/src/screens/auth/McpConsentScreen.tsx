import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BASE_URL } from '../../api/http';
import type { Me } from '../../api/types';
import { Logo } from '../../components/Logo';
import { color, font } from '../../theme/tokens';

export function McpConsentScreen() {
  const [params] = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void fetch(`${BASE_URL}/me`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setMe(null);
          return;
        }
        setMe(await res.json() as Me);
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);
  const appName = params.get('client_name') || 'Claude';
  const redirectUri = params.get('redirect_uri') || '';
  const state = params.get('state') || undefined;
  const codeChallenge = params.get('code_challenge') || undefined;
  const initialScope = params.get('scope') === 'read' ? 'read' : 'read_write';
  const [scope, setScope] = useState<'read' | 'read_write'>(initialScope);
  const [workspaceId, setWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = me?.user;
  const workspaces = me?.workspaces?.length ? me.workspaces : (me?.workspace.id ? [{ id: me.workspace.id, name: me.workspace.name, slug: me.workspace.slug ?? '', role: me.workspaceRole }] : []);
  const selected = workspaceId || me?.workspace.id || workspaces[0]?.id || '';
  const host = (() => {
    try {
      return redirectUri ? new URL(redirectUri).host : 'the assistant';
    } catch {
      return 'the assistant';
    }
  })();
  const next = `/oauth/consent?${params.toString()}`;

  async function allow() {
    if (!redirectUri) {
      setError('This request has no return address. Start again from the assistant.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/oauth/consent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName, redirectUri, scope, state, codeChallenge, workspaceId: selected }),
      });
      const json = await res.json().catch(() => null) as { redirectTo?: string; message?: string } | null;
      if (!res.ok || !json?.redirectTo) {
        setError(json?.message ?? 'Could not allow access. Try again.');
        return;
      }
      window.location.href = json.redirectTo;
    } catch {
      setError('Could not allow access. Check you are signed in, then try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', padding: '40px 24px 56px', background: color.canvas, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      <Logo />
      <section className="bt-card" style={{ width: '100%', maxWidth: 520, overflow: 'hidden' }}>
        <div style={{ padding: '28px 32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontFamily: font.display, fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.3 }}>{appName} wants to connect to your BornTask account</h1>
          <p style={{ margin: 0, fontSize: 14, color: color.ink3, lineHeight: 1.5 }}>This window opened from your assistant. After you allow access, it will send you back. {appName} will act as <strong>you</strong>, with your projects and workflow permissions. Changes are labelled "via MCP" in the activity log.</p>
        </div>
        {!user && !loading && (
          <div style={{ padding: '0 32px 24px' }}>
            <p style={{ margin: '0 0 12px', color: color.ink3 }}>Sign in first, then you can choose a workspace and an access level.</p>
            <Link to={`/sign-in?next=${encodeURIComponent(next)}`} style={{ color: color.brandStrong, fontWeight: 600 }}>Sign in</Link>
          </div>
        )}
        {user && (
          <>
            <div style={{ padding: '0 32px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: color.subtle, border: `1px solid ${color.divider}` }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: color.ink, color: color.surface, fontSize: 11, fontWeight: 600 }}>{user.initials}</span>
                <span style={{ flex: 1, fontSize: 13.5 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{user.name}</span>
                  <span style={{ color: color.muted, fontSize: 12.5 }}>{user.email}</span>
                </span>
                <Link to={`/sign-in?next=${encodeURIComponent(next)}`} style={{ fontSize: 13, color: color.brandStrong }}>Not you?</Link>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
                Workspace
                <select value={selected} onChange={(event) => setWorkspaceId(event.target.value)} style={{ height: 40, padding: '0 10px', border: `1px solid ${color.border}`, borderRadius: 8, font: 'inherit', fontSize: 14, fontWeight: 400, background: color.surface }}>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.role === 'guest' ? ' (guest)' : ''}</option>
                  ))}
                </select>
              </label>
              <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <legend style={{ padding: '0 0 8px', fontSize: 13, fontWeight: 500 }}>Access</legend>
                <ScopeOption selected={scope === 'read'} onSelect={() => setScope('read')} title="Read only" body="See projects, tasks and comments you can see. Good for summaries and reports." />
                <ScopeOption selected={scope === 'read_write'} onSelect={() => setScope('read_write')} title="Read and update" body="Also create tasks, edit them, comment, and move them through stages you're allowed to." />
              </fieldset>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: color.ink3 }}>
                <span>Follows the same workflow rules as you</span>
                <span>Can't delete tasks, change settings, or invite people</span>
                <span>Access lasts until you disconnect it in Connected apps</span>
              </div>
              {error && <p role="alert" style={{ margin: 0, color: color.danger, fontSize: 13 }}>{error}</p>}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '16px 32px 24px', borderTop: `1px solid ${color.divider}` }}>
              <Link to="/settings/tokens" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, border: `1px solid ${color.border}`, borderRadius: 10, color: color.ink, textDecoration: 'none', fontSize: 15, fontWeight: 500 }}>Cancel</Link>
              <button type="button" disabled={busy || !selected} onClick={() => void allow()} style={{ flex: 1, height: 46, border: 0, borderRadius: 10, background: color.brand, color: color.surface, font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{busy ? 'Allowing…' : 'Allow access'}</button>
            </div>
          </>
        )}
      </section>
      <p style={{ margin: 0, maxWidth: 520, textAlign: 'center', fontSize: 12.5, color: color.muted, lineHeight: 1.5 }}>
        Only allow apps you trust. The app's name comes from the request; we show the address it will return to: <strong style={{ color: color.ink3 }}>{host}</strong>.
      </p>
    </div>
  );
}

function ScopeOption({ selected, onSelect, title, body }: { selected: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <label style={{ display: 'flex', gap: 12, padding: '12px 14px', border: `1px solid ${selected ? color.brandBorder : color.border}`, borderRadius: 10, background: selected ? color.brandTint : color.surface, cursor: 'pointer' }}>
      <input type="radio" name="mcp-scope" checked={selected} onChange={onSelect} style={{ marginTop: 2 }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 12.5, color: color.muted, lineHeight: 1.45 }}>{body}</span>
      </span>
    </label>
  );
}
