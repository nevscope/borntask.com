import { Button, Input, Modal } from 'antd';
import { useState } from 'react';
import { ApiError } from '../api/http';
import { useApiTokens, useCreateToken, useMe, useRevokeGrant, useRevokeToken, type MintedToken } from '../api/queries';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SettingsFrame } from '../components/SettingsNav';
import { formatWhen } from '../lib/relativeTime';
import { color, font } from '../theme/tokens';

const TOOLS = ['search_tasks', 'get_task', 'create_task', 'update_task', 'move_task', 'add_comment', 'list_projects', 'list_my_tasks'];
const MCP_URL = import.meta.env.VITE_MCP_URL ?? 'http://localhost:3011/mcp';

function scopeChips(scopes: string[]): string[] {
  const chips: string[] = [];
  if (scopes.includes('read')) chips.push('Read tasks');
  if (scopes.includes('write') || scopes.includes('read_write')) chips.push('Write tasks');
  return chips.length ? chips : ['Read tasks'];
}

function when(iso: string | null): string {
  if (!iso) return 'Never';
  const minutes = (Date.now() - new Date(iso).getTime()) / 60000;
  if (minutes < 1) return 'Just now';
  return formatWhen(iso);
}

export function ApiTokensScreen() {
  const me = useMe().data;
  const tokens = useApiTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const revokeGrant = useRevokeGrant();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'read_write'>('read_write');
  const [minted, setMinted] = useState<MintedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [pendingGrant, setPendingGrant] = useState<{ id: string; appName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const rows = tokens.data?.tokens ?? [];
  const grants = tokens.data?.grants ?? [];

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: '1 1 300px' }}>
          <h1 className="bt-h1">API tokens and MCP</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: color.muted }}>Connect Claude, Cursor or your own scripts. They act as you, with your projects and workflow rules.</p>
        </div>
        <Button type="primary" onClick={() => { setName(''); setScope('read_write'); setError(null); setOpen(true); }}>Create token</Button>
      </div>
      {minted && (
        <section role="status" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, border: `1px solid ${color.brandBorder}`, borderRadius: 12, background: color.brandTint }}>
          <span style={{ fontWeight: 600, color: color.brandStrong }}>Token "{minted.name}" created. Copy it now; it will not be shown again.</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <code style={{ flex: '1 1 320px', display: 'flex', alignItems: 'center', minHeight: 38, padding: '0 12px', border: `1px solid ${color.brandBorder}`, borderRadius: 8, background: color.surface, fontFamily: font.mono, fontSize: 13, overflow: 'auto' }}>{minted.token}</code>
            <Button type="primary" onClick={() => { void navigator.clipboard?.writeText(minted.token).then(() => setCopied(true)); }}>
              {copied ? 'Copied' : 'Copy token'}
            </Button>
          </div>
        </section>
      )}
      <section className="bt-card" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(180px, 1.2fr) 120px 110px 80px', gap: 12, padding: '10px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
            <span>Name</span><span>Access</span><span>Last used</span><span>Created</span><span />
          </div>
          {tokens.isLoading && <p style={{ padding: 16, margin: 0, color: color.muted, fontSize: 13 }}>Loading tokens…</p>}
          {tokens.isError && <p style={{ padding: 16, margin: 0, color: color.danger, fontSize: 13 }}>{tokens.error instanceof ApiError ? tokens.error.message : 'Could not load tokens.'}</p>}
          {rows.length === 0 && !tokens.isLoading && !tokens.isError && (
            <p style={{ padding: 16, margin: 0, color: color.muted, fontSize: 13 }}>No personal tokens yet. Create one to connect an assistant or a script.</p>
          )}
          {rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(180px, 1.2fr) 120px 110px 80px', gap: 12, alignItems: 'center', minHeight: 52, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <span style={{ fontWeight: 500 }}>{row.name} <span style={{ color: color.muted, fontWeight: 400, fontFamily: font.mono, fontSize: 12 }}>bt_pat_…{row.hint}</span></span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {scopeChips(row.scopes).map((chip) => (
                  <span key={chip} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: color.chip, color: color.ink3 }}>{chip}</span>
                ))}
              </span>
              <span style={{ fontSize: 13, color: color.ink3 }}>{when(row.lastUsedAt)}</span>
              <span style={{ fontSize: 13, color: color.muted }}>{when(row.createdAt)}</span>
              <button type="button" onClick={() => setRevokeId(row.id)} style={{ height: 32, padding: '0 8px', border: 0, borderRadius: 8, background: 'transparent', font: 'inherit', fontSize: 13, color: color.danger, cursor: 'pointer' }}>Revoke</button>
            </div>
          ))}
        </div>
      </section>
      <section className="bt-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Connect an AI assistant over MCP</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, lineHeight: 1.5, color: color.ink2 }}>
          <li>In Claude or Cursor, add a custom MCP connector with this server URL.</li>
          <li>When asked, paste the token you created above, or allow access and pick Read only or Read and update.</li>
          <li>Ask things like "what's blocking this project?" or "create a bug for the checkout issue".</li>
        </ol>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <code style={{ flex: '1 1 320px', display: 'flex', alignItems: 'center', minHeight: 38, padding: '0 12px', border: `1px solid ${color.border}`, borderRadius: 8, background: color.subtle, fontFamily: font.mono, fontSize: 13 }}>{MCP_URL}</code>
          <Button onClick={() => void navigator.clipboard?.writeText(MCP_URL)}>Copy URL</Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: color.muted, marginRight: 4 }}>Tools available:</span>
          {TOOLS.map((tool) => (
            <code key={tool} style={{ fontFamily: font.mono, fontSize: 12, padding: '2px 8px', borderRadius: 6, background: color.chip, color: color.ink3 }}>{tool}</code>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>Moves made over MCP follow the same workflow rules as yours and appear in the activity log as "via MCP". Tokens cannot delete tasks, change settings or invite people.</p>
      </section>
      <section className="bt-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: color.muted }}>Connected apps</span>
        {grants.length === 0 && <span style={{ fontSize: 13.5, color: color.muted }}>No apps connected with OAuth yet. A personal token is enough for Cursor and scripts.</span>}
        {grants.map((grant) => (
          <div key={grant.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${color.divider}` }}>
            <span style={{ flex: '1 1 200px' }}>
              <span style={{ display: 'block', fontWeight: 600 }}>{grant.appName}</span>
              <span style={{ fontSize: 12.5, color: color.muted }}>
                {grant.scope === 'read_write' ? 'Read and update' : 'Read only'} · {grant.redirectHost} · last used {when(grant.lastUsedAt)}
              </span>
            </span>
            <button type="button" onClick={() => setPendingGrant({ id: grant.id, appName: grant.appName })} style={{ height: 32, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', font: 'inherit', fontSize: 13, color: color.danger, cursor: 'pointer' }}>Disconnect</button>
          </div>
        ))}
      </section>
      <Modal
        open={open}
        title="Create token"
        okText="Create token"
        confirmLoading={create.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => {
          const trimmed = name.trim();
          if (!trimmed) {
            setError('Give the token a name.');
            return;
          }
          create.mutate({ name: trimmed, scope }, {
            onSuccess: (row) => {
              setMinted(row);
              setCopied(false);
              setOpen(false);
            },
            onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the token.'),
          });
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Name
            <Input value={name} autoFocus placeholder="Claude (MCP)" onChange={(event) => setName(event.target.value)} />
          </label>
          <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend style={{ padding: '0 0 8px', fontSize: 13, fontWeight: 500 }}>Access</legend>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="radio" name="token-scope" checked={scope === 'read'} onChange={() => setScope('read')} />
              <span><strong>Read only</strong><span style={{ display: 'block', fontSize: 12.5, color: color.muted }}>See projects, tasks and comments you can see.</span></span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input type="radio" name="token-scope" checked={scope === 'read_write'} onChange={() => setScope('read_write')} />
              <span><strong>Read and update</strong><span style={{ display: 'block', fontSize: 12.5, color: color.muted }}>Also create, edit, comment and move tasks you are allowed to.</span></span>
            </label>
          </fieldset>
          {error && <p style={{ margin: 0, color: color.danger, fontSize: 13 }}>{error}</p>}
        </div>
      </Modal>
      <ConfirmDialog
        open={revokeId !== null}
        title="Revoke this token?"
        confirmLabel="Revoke"
        busy={revoke.isPending}
        onCancel={() => setRevokeId(null)}
        onConfirm={() => {
          if (!revokeId) return;
          revoke.mutate(revokeId, { onSuccess: () => { setRevokeId(null); setMinted(null); } });
        }}
      >
        Anything still using it, including an assistant, will stop working. This cannot be undone.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingGrant !== null}
        title={pendingGrant ? `Disconnect "${pendingGrant.appName}"?` : 'Disconnect this app?'}
        confirmLabel="Disconnect"
        busy={revokeGrant.isPending}
        onCancel={() => setPendingGrant(null)}
        onConfirm={() => {
          if (!pendingGrant) return;
          revokeGrant.mutate(pendingGrant.id, { onSuccess: () => setPendingGrant(null) });
        }}
      >
        Anything using it stops working immediately. This cannot be undone.
      </ConfirmDialog>
    </SettingsFrame>
  );
}
