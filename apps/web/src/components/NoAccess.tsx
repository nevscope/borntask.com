import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, BASE_URL } from '../api/http';
import { color, font, radius } from '../theme/tokens';

function Lock() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={color.faint} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function NoAccess({ projectKey, error }: { projectKey: string; error: unknown }) {
  const [sent, setSent] = useState(false);
  const [lead, setLead] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const missing = error instanceof ApiError && error.status === 404;

  const ask = async () => {
    setNote(null);
    const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(projectKey)}/access-requests`, {
      method: 'POST',
      credentials: 'include',
    });
    const json = await res.json().catch(() => null) as { message?: string; leadName?: string | null } | null;
    if (!res.ok) {
      setNote(json?.message ?? 'Could not send the request.');
      return;
    }
    setLead(json?.leadName ?? null);
    setSent(true);
  };

  return (
    <div className="bt-page">
      <div className="bt-card" style={{ minHeight: 270, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10, padding: 24 }}>
        <Lock />
        <span style={{ fontFamily: font.display, fontSize: 17, fontWeight: 600 }}>You're not on this project</span>
        <span style={{ fontSize: 13.5, color: color.ink3, maxWidth: 320, lineHeight: 1.45 }}>
          {missing
            ? `${projectKey} is not a project in this workspace.`
            : lead
              ? `Ask the project lead, ${lead}, to add you.`
              : 'Ask a project lead to add you.'}
        </span>
        {sent ? (
          <span style={{ fontSize: 13.5, color: color.brandStrong }}>Request sent.</span>
        ) : (
          <button type="button" onClick={() => void ask()} style={{ height: 36, padding: '0 14px', marginTop: 4, border: 0, borderRadius: radius.md, background: color.brandFill, color: color.brandOn, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Request access
          </button>
        )}
        {note && <span style={{ fontSize: 13, color: color.danger }}>{note}</span>}
        <Link to="/" style={{ fontSize: 13 }}>Back to My tasks</Link>
      </div>
    </div>
  );
}
