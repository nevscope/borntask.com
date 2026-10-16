import { color, font } from '../theme/tokens';
import { LEGAL_UPDATED, legalIntro, legalTitle, sectionsFor, type LegalKind } from '../legal/legalCopy';

export function LegalArticle({ kind }: { kind: LegalKind }) {
  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
      <header>
        <h1 className="bt-h1">{legalTitle(kind)}</h1>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: color.muted, lineHeight: 1.5 }}>{legalIntro(kind)}</p>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: color.faint }}>Last updated {LEGAL_UPDATED}</p>
      </header>
      {sectionsFor(kind).map((section) => (
        <section key={section.title} className="bt-card" style={{ padding: '18px 20px' }}>
          <h2 style={{ margin: '0 0 10px', fontFamily: font.display, fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {section.title}
          </h2>
          <div className="bt-legal-body">{section.body}</div>
        </section>
      ))}
    </article>
  );
}
