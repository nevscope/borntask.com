import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { color, font } from '../../theme/tokens';

export function McpConnectedScreen() {
  const [params] = useSearchParams();
  const appName = params.get('app') || 'Your assistant';
  const workspace = params.get('workspace') || 'this workspace';
  const scope = params.get('scope') === 'read' ? 'read' : 'read and update';

  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', padding: '40px 24px 56px', background: color.canvas, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      <Logo />
      <section className="bt-card" style={{ width: '100%', maxWidth: 520, padding: '36px 32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <h1 style={{ margin: 0, fontFamily: font.display, fontSize: 24, fontWeight: 600 }}>{appName} is connected</h1>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: color.ink3 }}>
          You can close this tab and go back to {appName}. It can now {scope} tasks in <strong>{workspace}</strong> as you.
        </p>
        <div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', borderRadius: 12, background: color.subtle, border: `1px solid ${color.divider}`, textAlign: 'left' }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: color.muted }}>Try asking</span>
          <span style={{ fontSize: 14 }}>What's blocking this project this week?</span>
          <span style={{ fontSize: 14 }}>Create a bug for the checkout issue and assign it to me.</span>
          <span style={{ fontSize: 14 }}>Summarise what was deployed since Monday.</span>
        </div>
        <Link to="/settings/tokens" style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 16px', border: `1px solid ${color.border}`, borderRadius: 10, color: color.ink3, textDecoration: 'none', fontSize: 13.5 }}>Manage connected apps</Link>
      </section>
    </div>
  );
}
