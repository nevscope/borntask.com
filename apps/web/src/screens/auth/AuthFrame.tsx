import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { color } from '../../theme/tokens';

export function AuthFrame({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: color.canvas }}>
      <div style={{ width: 'min(440px, 100%)' }}>
        <div style={{ marginBottom: 24 }}><Logo /></div>
        <div className="bt-card" style={{ padding: 28 }}>
          <h1 className="bt-h1" style={{ fontSize: 24, marginBottom: 16 }}>{title}</h1>
          {children}
        </div>
        {footer ? <p style={{ marginTop: 16, color: color.muted, fontSize: 13 }}>{footer}</p> : null}
      </div>
    </div>
  );
}
