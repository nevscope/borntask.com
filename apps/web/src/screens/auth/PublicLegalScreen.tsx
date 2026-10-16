import { Link } from 'react-router-dom';
import { LegalArticle } from '../../components/LegalArticle';
import { LogoMark } from '../../components/Logo';
import type { LegalKind } from '../../legal/legalCopy';
import { color, font } from '../../theme/tokens';

export function PublicLegalScreen({ kind }: { kind: LegalKind }) {
  const other = kind === 'privacy' ? { to: '/terms', label: 'Terms of use' } : { to: '/privacy', label: 'Privacy notice' };

  return (
    <div style={{ minHeight: '100dvh', background: color.canvas }}>
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 16,
          padding: '18px 28px',
          background: color.surface,
          borderBottom: `1px solid ${color.border}`,
        }}
      >
        <Link to="/sign-in" style={{ display: 'flex', alignItems: 'center', gap: 10, color: color.ink, textDecoration: 'none' }}>
          <LogoMark size={22} />
          <span style={{ fontFamily: font.display, fontSize: 18, fontWeight: 600, letterSpacing: '-0.03em' }}>BornTask</span>
        </Link>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13.5 }}>
          <Link to={other.to} style={{ color: color.brandStrong, textDecoration: 'none', fontWeight: 500 }}>{other.label}</Link>
          <Link to="/sign-in" style={{ color: color.ink3, textDecoration: 'none' }}>Sign in</Link>
        </nav>
      </header>
      <main style={{ padding: '28px 24px 48px', display: 'flex', justifyContent: 'center' }}>
        <LegalArticle kind={kind} />
      </main>
    </div>
  );
}
