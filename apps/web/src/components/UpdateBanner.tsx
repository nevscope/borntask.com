import { useEffect, useState } from 'react';
import { APP_RELOAD_CHANNEL, reloadAllOpenPages } from '../lib/appReload';
import { color, radius } from '../theme/tokens';

const POLL_MS = 120_000;

async function remoteBuildId(): Promise<string | null> {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const body: unknown = await res.json();
  if (!body || typeof body !== 'object') return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;

    const check = async () => {
      try {
        const remote = await remoteBuildId();
        if (!cancelled && remote && remote !== __BT_BUILD_ID__) setReady(true);
      } catch {
        /* offline or first paint of a deploy */
      }
    };

    void check();
    const timer = window.setInterval(() => { void check(); }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(APP_RELOAD_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data === 'reload') window.location.reload();
      };
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      channel?.close();
    };
  }, []);

  if (!ready) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '8px 16px',
        background: color.brandTint,
        borderBottom: `1px solid ${color.brandBorder}`,
        color: color.ink,
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      <span>A new version of BornTask is ready. Reload to get the latest changes.</span>
      <button
        type="button"
        onClick={() => reloadAllOpenPages()}
        style={{
          height: 30,
          padding: '0 12px',
          border: 0,
          borderRadius: radius.md,
          background: color.brandFill,
          color: color.brandOn,
          font: 'inherit',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}
