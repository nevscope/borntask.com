import { Link } from 'react-router-dom';
import { LegalArticle } from '../components/LegalArticle';
import { SettingsFrame } from '../components/SettingsNav';
import { useMe } from '../api/queries';
import type { LegalKind } from '../legal/legalCopy';
import { color } from '../theme/tokens';

export function LegalSettingsScreen({ kind }: { kind: LegalKind }) {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      {kind === 'privacy' && (
        <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Your controls</span>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: color.ink3 }}>
            Notification channels, digest and Chat live on{' '}
            <Link to="/settings/profile" style={{ color: color.brandStrong, fontWeight: 500 }}>Profile and notifications</Link>
            . Tokens and MCP grants are on{' '}
            <Link to="/settings/tokens" style={{ color: color.brandStrong, fontWeight: 500 }}>API tokens and MCP</Link>
            . Owners can delete a workspace under{' '}
            <Link to="/settings/workspace" style={{ color: color.brandStrong, fontWeight: 500 }}>Workspace</Link>
            .
          </p>
        </section>
      )}
      <LegalArticle kind={kind} />
    </SettingsFrame>
  );
}
