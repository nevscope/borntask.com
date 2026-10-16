import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { color } from '../../theme/tokens';

export function AuthFrame({ title, eyebrow, children, footer }: { title: string; eyebrow?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: color.canvas }}>
      <div style={{ width: 'min(440px, 100%)' }}>
        <div style={{ marginBottom: 24 }}><Logo /></div>
        <div className="bt-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {eyebrow}
          <h1 className="bt-h1" style={{ fontSize: 22, margin: 0 }}>{title}</h1>
          {children}
        </div>
        {footer ? <p style={{ marginTop: 16, color: color.muted, fontSize: 13 }}>{footer}</p> : null}
      </div>
    </div>
  );
}
