import { Button, Checkbox, Input } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/http';
import { useChatSettings, useDisconnectChat, useMe, useProject, useSaveChat, useTestChat, type ChatEvents } from '../api/queries';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LogoMark } from '../components/Logo';
import { SettingsFrame } from '../components/SettingsNav';
import { formatWhen } from '../lib/relativeTime';
import { color, font } from '../theme/tokens';

const EVENT_ROWS: { key: keyof ChatEvents; label: string }[] = [
  { key: 'assigned', label: 'A task is assigned to someone' },
  { key: 'ready_for_testing', label: 'A task moves to Ready for testing' },
  { key: 'deployed', label: 'A task is deployed' },
  { key: 'mention', label: 'Someone is @mentioned in a comment' },
  { key: 'status_change', label: 'Any status change' },
  { key: 'new_idea', label: 'A new idea is created' },
];

function looksLikeWebhook(url: string): boolean {
  return /^https:\/\/chat\.googleapis\.com\/.+\/spaces\/[^/\s?#]+/i.test(url.trim());
}

const STEPS = [
  'In Google Chat, open the space you want updates in (for example "Website team").',
  'Open the space menu, choose Apps and integrations, then Webhooks, name it "BornTask" and copy the URL.',
  'Paste it here and press Send test message.',
];

export function GoogleChatScreen() {
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const project = useProject(projectKey).data;
  const chat = useChatSettings(projectKey);
  const save = useSaveChat(projectKey);
  const test = useTestChat(projectKey);
  const disconnect = useDisconnectChat(projectKey);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [url, setUrl] = useState('');
  const [urlDirty, setUrlDirty] = useState(false);
  const [events, setEvents] = useState<ChatEvents>({
    assigned: true,
    ready_for_testing: true,
    deployed: true,
    mention: true,
    status_change: false,
    new_idea: false,
  });
  const [eventsReady, setEventsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!chat.data || eventsReady) return;
    setEvents(chat.data.events);
    if (chat.data.webhookMask) setUrl(chat.data.webhookMask);
    setEventsReady(true);
  }, [chat.data, eventsReady]);

  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const myRoles = project?.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const canManage = canAdmin || myRoles.includes('lead') || project?.project.leadId === me?.user.id;
  const current = events;
  const connected = Boolean(chat.data?.connected);
  const lastError = error ?? chat.data?.lastError ?? null;

  function messageOf(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return 'Could not reach Google Chat. Check the URL and try again.';
  }

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">Google Chat</h1>
      <p style={{ color: color.muted, margin: '6px 0 0' }}>Post task updates from this project into a Chat space.</p>
      {chat.isError && (
        <p role="alert" style={{ margin: 0, color: color.danger, fontSize: 13.5 }}>
          {chat.error instanceof ApiError ? chat.error.message : 'Could not load Chat settings. Check the API is running, then refresh.'}
        </p>
      )}
      {!connected && (
        <section className="bt-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600 }}>Connect a Chat space in 3 steps</span>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {STEPS.map((step, index) => (
              <li key={step} style={{ display: 'flex', gap: 12 }}>
                <span style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: color.brandTint, color: color.brandStrong, fontSize: 12, fontWeight: 600 }}>{index + 1}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{step}</span>
              </li>
            ))}
          </ol>
          <span style={{ fontSize: 12.5, color: color.muted, lineHeight: 1.45 }}>Your Google Workspace admin may need to allow incoming webhooks first.</span>
        </section>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="bt-card" style={{ flex: '999 1 420px', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {connected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: color.brandTint, color: color.brandStrong, fontSize: 13.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color.brand }} />
              <span style={{ flex: 1 }}>
                <strong>Connected</strong>
                {chat.data?.lastPostedAt ? ` · last post ${formatWhen(chat.data.lastPostedAt)}` : ' · no posts yet'}
              </span>
            </div>
          )}
          {lastError && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color.danger }} />
              {lastError}
            </div>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Webhook URL
            <Input
              value={url}
              disabled={!canManage}
              placeholder="https://chat.googleapis.com/v1/spaces/…"
              onChange={(event) => {
                setUrl(event.target.value);
                setUrlDirty(true);
                setSaved(false);
                setError(null);
              }}
            />
            <span style={{ fontWeight: 400, fontSize: 12.5, color: color.muted }}>In Google Chat: open the space, then Apps and integrations, then Webhooks. Stored encrypted.</span>
          </label>
          <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <legend style={{ padding: '0 0 8px', fontSize: 13, fontWeight: 500 }}>Send a message when</legend>
            {current && EVENT_ROWS.map((row) => (
              <Checkbox
                key={row.key}
                disabled={!canManage}
                checked={current[row.key]}
                onChange={(event) => {
                  setEvents({ ...current, [row.key]: event.target.checked });
                  setSaved(false);
                }}
              >
                {row.label}
              </Checkbox>
            ))}
          </fieldset>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              type="primary"
              disabled={!canManage}
              loading={save.isPending}
              onClick={() => {
                const typed = urlDirty && !url.includes('••••') ? url.trim() : '';
                if (typed && !looksLikeWebhook(typed)) {
                  setError('That does not look like a Google Chat webhook. Copy the URL from Apps and integrations, then Webhooks.');
                  return;
                }
                setError(null);
                save.mutate(
                  { events: current, webhookUrl: urlDirty && !url.includes('••••') ? url.trim() : undefined },
                  {
                    onSuccess: (data) => {
                      setUrl(data.webhookMask);
                      setUrlDirty(false);
                      setEvents(data.events);
                      setSaved(true);
                    },
                    onError: (err) => setError(messageOf(err)),
                  },
                );
              }}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
            <Button
              disabled={!canManage}
              loading={test.isPending}
              onClick={() => {
                const typed = urlDirty && !url.includes('••••') ? url.trim() : '';
                if (!typed && !connected) {
                  setError('Paste a webhook URL first.');
                  return;
                }
                if (typed && !looksLikeWebhook(typed)) {
                  setError('That does not look like a Google Chat webhook. Copy the URL from Apps and integrations, then Webhooks.');
                  return;
                }
                setError(null);
                test.mutate(
                  { webhookUrl: urlDirty && !url.includes('••••') ? url.trim() : undefined },
                  { onError: (err) => setError(messageOf(err)) },
                );
              }}
            >
              Send test message
            </Button>
            {connected && (
              <Button type="text" danger disabled={!canManage} loading={disconnect.isPending} onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </Button>
            )}
          </div>
          {!canManage && <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>Only a project lead or workspace admin can change this.</p>}
        </section>
        <aside style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: color.muted }}>Message preview</span>
          <div className="bt-card" style={{ padding: 14, display: 'flex', gap: 10 }}>
            <LogoMark size={32} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13 }}><strong>BornTask</strong> <span style={{ color: color.muted }}>· App</span></span>
              <div style={{ border: `1px solid ${color.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: color.muted }}>{project?.project.name ?? projectKey}</span>
                <span style={{ fontWeight: 600 }}>A task was assigned</span>
                <span style={{ fontSize: 13, color: color.ink3 }}>The card includes a link back to the task.</span>
                <span style={{ display: 'inline-flex', alignSelf: 'flex-start', height: 30, alignItems: 'center', padding: '0 12px', marginTop: 4, borderRadius: 7, border: `1px solid ${color.brandBorder}`, color: color.brandStrong, fontSize: 13, fontWeight: 600 }}>Open task</span>
              </div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: color.muted, lineHeight: 1.5 }}>Webhooks only post into the space. Creating tasks from a Chat message needs the BornTask Chat app (planned for v2).</p>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Google Chat?"
        confirmLabel="Disconnect"
        busy={disconnect.isPending}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setError(null);
          disconnect.mutate(undefined, {
            onSuccess: (next) => {
              setUrl('');
              setUrlDirty(false);
              setEvents(next.events);
              setEventsReady(true);
              setSaved(false);
              setConfirmDisconnect(false);
            },
            onError: (err) => setError(messageOf(err)),
          });
        }}
      >
        This space will stop receiving BornTask updates. You can connect it again later.
      </ConfirmDialog>
    </SettingsFrame>
  );
}
