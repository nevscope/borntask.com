import { Alert, Button, Checkbox, Input, Segmented, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, BASE_URL } from '../api/http';
import { qk, useDisconnectMyChat, useMe, useMyChat, useSaveMyChat, useTestMyChat, type PersonalChatPrefs } from '../api/queries';
import { Avatar } from '../components/Chips';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SettingsFrame } from '../components/SettingsNav';
import { useStatusToast } from '../components/StatusToast';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { formatWhen } from '../lib/relativeTime';
import { useThemePreference } from '../theme/ThemeProvider';
import { timeZoneSelectOptions } from '@borntask/shared';
import { color } from '../theme/tokens';

const EVENTS = [
  { key: 'assigned', label: 'I am assigned a task' },
  { key: 'mention', label: 'I am @mentioned in a comment' },
  { key: 'watched_stage', label: 'A task I watch moves stage' },
  { key: 'watched_comment', label: 'Someone comments on a task I watch' },
  { key: 'reported_deployed', label: 'A task I reported is deployed' },
  { key: 'access_request', label: 'Someone requests access to a project' },
  { key: 'digest_ready', label: 'Daily digest is ready' },
] as const;

const CHAT_KEY: Partial<Record<(typeof EVENTS)[number]['key'], keyof PersonalChatPrefs>> = {
  assigned: 'assigned',
  mention: 'mention',
  watched_stage: 'watch_stage',
  watched_comment: 'watch_comment',
  reported_deployed: 'reporter_deployed',
};

const OFF_CHAT: PersonalChatPrefs = {
  assigned: false,
  mention: false,
  watch_stage: false,
  watch_comment: false,
  reporter_deployed: false,
};

function looksLikeWebhook(url: string): boolean {
  return /^https:\/\/chat\.googleapis\.com\/.+\/spaces\/[^/\s?#]+/i.test(url.trim());
}

function chatMessageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Could not reach Google Chat. Check the URL and try again.';
}

const NAME_MAX = 80;

function nameFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a display name.';
  if (trimmed.length > NAME_MAX) return 'Display name must be 80 characters or fewer.';
  return null;
}

function saveErrorMessage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'Could not save your profile.';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) return trimmed;
  try {
    const issues = JSON.parse(trimmed) as { code?: string; path?: unknown[]; message?: string }[];
    const issue = issues[0];
    if (issue?.path?.[0] === 'name' && issue.code === 'too_big') {
      return 'Display name must be 80 characters or fewer.';
    }
    if (typeof issue?.message === 'string' && !issue.message.startsWith('[')) return issue.message;
  } catch {
    /* fall through */
  }
  return 'Could not save your profile.';
}

type DigestMode = 'workdays' | 'daily' | 'off';
type Pref = { event: string; inApp: boolean; email: boolean };
type Profile = {
  name: string;
  email: string;
  timeZone: string;
  digestMode: DigestMode;
  emailPerTask: boolean;
  prefs: Pref[];
};

function snapshot(draft: { name: string; timeZone: string; digestMode: DigestMode; emailPerTask: boolean; prefs: Pref[] }) {
  return JSON.stringify({
    name: draft.name.trim(),
    timeZone: draft.timeZone,
    digestMode: draft.digestMode,
    emailPerTask: draft.emailPerTask,
    prefs: draft.prefs,
  });
}

function emptyPrefs(): Pref[] {
  return EVENTS.map((row) => ({ event: row.key, inApp: true, email: false }));
}

function eventEmailOn(list: Pref[]) {
  return list.some((row) => row.event !== 'digest_ready' && row.email);
}

export function ProfileSettingsScreen() {
  const me = useMe().data;
  const qc = useQueryClient();
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const [name, setName] = useState(me?.user.name ?? '');
  const [timeZone, setTimeZone] = useState<string>('Europe/Malta');
  const [digestMode, setDigestMode] = useState<DigestMode>('workdays');
  const [emailPerTask, setEmailPerTask] = useState(false);
  const [prefs, setPrefs] = useState<Pref[]>(emptyPrefs);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const chat = useMyChat();
  const saveChat = useSaveMyChat();
  const testChat = useTestMyChat();
  const disconnectChat = useDisconnectMyChat();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [urlDirty, setUrlDirty] = useState(false);
  const [chatPrefs, setChatPrefs] = useState<PersonalChatPrefs>(OFF_CHAT);
  const [chatReady, setChatReady] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSaved, setChatSaved] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const toast = useStatusToast();
  const themePref = useThemePreference();

  useEffect(() => {
    if (!chat.data || chatReady) return;
    setChatPrefs(chat.data.prefs);
    if (chat.data.webhookMask) setWebhookUrl(chat.data.webhookMask);
    setChatReady(true);
  }, [chat.data, chatReady]);

  const chatConnected = Boolean(chat.data?.connected);
  const chatAppOn = Boolean(chat.data?.appConfigured);
  const chatDmOn = Boolean(chat.data?.dmConfigured);
  const chatColumnOn = chatConnected || chatAppOn;
  const lastChatError = chatError ?? chat.data?.lastError ?? null;

  const profile = useQuery({
    queryKey: ['me-profile'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/me/profile`, { credentials: 'include' });
      if (!res.ok) throw new Error('Sign in to load your profile.');
      return (await res.json()) as Profile;
    },
  });

  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.name);
    setTimeZone(profile.data.timeZone);
    setDigestMode(profile.data.digestMode);
    setEmailPerTask(profile.data.emailPerTask);
    setPrefs(profile.data.prefs);
    setBaseline(snapshot(profile.data));
    setSaved(false);
  }, [profile.data]);

  const dirty = Boolean(baseline) && snapshot({ name, timeZone, digestMode, emailPerTask, prefs }) !== baseline;
  const unsaved = useUnsavedChanges(dirty || urlDirty);

  const prefOf = (event: string) => prefs.find((row) => row.event === event) ?? { event, inApp: true, email: true };

  const patchPref = (event: string, next: Partial<Pref>) => {
    setSaved(false);
    setPrefs((list) => {
      const updated = list.map((row) => (row.event === event ? { ...row, ...next } : row));
      if (event === 'digest_ready' && next.email !== undefined) {
        setDigestMode(next.email ? (digestMode === 'off' ? 'workdays' : digestMode) : 'off');
      }
      if (event !== 'digest_ready' && next.email !== undefined) {
        setEmailPerTask(eventEmailOn(updated));
      }
      return updated;
    });
  };

  const setDigest = (value: DigestMode) => {
    setDigestMode(value);
    setSaved(false);
    setPrefs((list) => list.map((row) => (row.event === 'digest_ready' ? { ...row, email: value !== 'off' } : row)));
  };

  const setPerTask = (on: boolean) => {
    setEmailPerTask(on);
    setSaved(false);
    setPrefs((list) => list.map((row) => (row.event === 'digest_ready' ? row : { ...row, email: on })));
  };

  const save = async () => {
    const fieldError = nameFieldError(name);
    setNameError(fieldError);
    setError(null);
    setSaved(false);
    if (fieldError) return;
    setBusy(true);
    const res = await fetch(`${BASE_URL}/me/profile`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), timeZone, digestMode, emailPerTask, prefs }),
    });
    const json = await res.json().catch(() => ({})) as Profile & { message?: string };
    setBusy(false);
    if (!res.ok) {
      const message = saveErrorMessage(json.message);
      if (message.toLowerCase().includes('display name') || message.toLowerCase().includes('name must')) {
        setNameError(message);
      } else {
        setError(message);
      }
      return;
    }
    setName(json.name);
    setTimeZone(json.timeZone);
    setDigestMode(json.digestMode);
    setEmailPerTask(json.emailPerTask);
    setPrefs(json.prefs);
    setBaseline(snapshot(json));
    setSaved(true);
    toast.show('Profile saved.');
    void qc.invalidateQueries({ queryKey: qk.me });
  };

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">Profile and notifications</h1>
      {profile.error && <Alert type="error" message={profile.error.message} style={{ marginTop: 12 }} />}
      {error && <Alert type="error" message={error} style={{ marginTop: 12 }} />}
      <section className="bt-card" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
        <Avatar user={me?.user} size={64} />
        <div style={{ flex: '1 1 300px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Display name
            <Input
              value={name}
              status={nameError ? 'error' : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
                setSaved(false);
              }}
              styles={{ root: { height: 38, padding: '0 12px' } }}
            />
            {nameError && (
              <span role="alert" style={{ fontWeight: 400, fontSize: 12.5, color: color.danger }}>{nameError}</span>
            )}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
            Time zone
            <Select
              value={timeZone}
              onChange={(value) => { setTimeZone(value); setSaved(false); }}
              style={{ height: 38, padding: '0 12px' }}
              showSearch
              optionFilterProp="label"
              options={timeZoneSelectOptions()}
            />
          </label>
        </div>
        <span style={{ flexBasis: '100%', fontSize: 12.5, color: color.muted }}>
          Signed in as {profile.data?.email ?? me?.user.email}. Name and photo come from your Google or Microsoft account unless you change them here.
        </span>
      </section>
      <section className="bt-card" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <span style={{ flex: '1 1 280px' }}>
          <span style={{ display: 'block', fontWeight: 600 }}>Appearance</span>
          <span style={{ fontSize: 13, color: color.muted }}>Applies on this device. System follows your operating system.</span>
        </span>
        <Segmented
          aria-label="Appearance"
          value={themePref.appearance}
          onChange={(value) => themePref.setAppearance(value as 'system' | 'light' | 'dark')}
          options={[
            { label: 'System', value: 'system' },
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ]}
        />
      </section>
      <section className="bt-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Your Google Chat space</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: color.muted, lineHeight: 1.5 }}>
            Incoming webhooks post to a space - they cannot send a direct message to a person. Create a Chat space (it can be a space with only you). Open Apps and integrations, then Webhooks, name it BornTask and paste the URL here.
          </p>
        </div>
        {chat.isError && (
          <p role="alert" style={{ margin: 0, color: color.danger, fontSize: 13.5 }}>
            {chat.error instanceof ApiError ? chat.error.message : 'Could not load Chat settings. Check the API is running, then refresh.'}
          </p>
        )}
        {chatConnected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: color.brandTint, color: color.brandStrong, fontSize: 13.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color.brand }} />
            <span>
              <strong>Connected</strong>
              {chat.data?.lastPostedAt ? ` · last post ${formatWhen(chat.data.lastPostedAt)}` : ' · no posts yet'}
            </span>
          </div>
        )}
        {lastChatError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: color.dangerTint, color: color.danger, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color.danger }} />
            {lastChatError}
          </div>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
          Webhook URL
          <Input
            value={webhookUrl}
            placeholder="https://chat.googleapis.com/v1/spaces/…"
            onChange={(event) => {
              setWebhookUrl(event.target.value);
              setUrlDirty(true);
              setChatSaved(false);
              setChatError(null);
            }}
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button
            type="primary"
            loading={saveChat.isPending}
            onClick={() => {
              const typed = urlDirty && !webhookUrl.includes('••••') ? webhookUrl.trim() : '';
              if (typed && !looksLikeWebhook(typed)) {
                setChatError('That does not look like a Google Chat webhook. Copy the URL from Apps and integrations, then Webhooks.');
                return;
              }
              if (!typed && !chatConnected && !chatAppOn) {
                setChatError('Paste a webhook URL first.');
                return;
              }
              setChatError(null);
              saveChat.mutate(
                { webhookUrl: typed || undefined, prefs: chatColumnOn ? chatPrefs : undefined },
                {
                  onSuccess: (data) => {
                    setWebhookUrl(data.webhookMask);
                    setUrlDirty(false);
                    setChatPrefs(data.prefs);
                    setChatReady(true);
                    setChatSaved(true);
                  },
                  onError: (err) => setChatError(chatMessageOf(err)),
                },
              );
            }}
          >
            {chatSaved ? 'Saved' : 'Save'}
          </Button>
          <Button
            loading={testChat.isPending}
            onClick={() => {
              const typed = urlDirty && !webhookUrl.includes('••••') ? webhookUrl.trim() : '';
              if (!typed && !chatConnected) {
                setChatError('Paste a webhook URL first.');
                return;
              }
              if (typed && !looksLikeWebhook(typed)) {
                setChatError('That does not look like a Google Chat webhook. Copy the URL from Apps and integrations, then Webhooks.');
                return;
              }
              setChatError(null);
              testChat.mutate(
                { webhookUrl: typed || undefined },
                { onError: (err) => setChatError(chatMessageOf(err)) },
              );
            }}
          >
            Send test
          </Button>
          {chatConnected && (
            <Button type="text" danger loading={disconnectChat.isPending} onClick={() => setConfirmDisconnect(true)}>
              Disconnect
            </Button>
          )}
        </div>
      </section>
      <section className="bt-card" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Notify me when</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: color.muted }}>Tick Email for the events you want in your inbox. The daily digest has its own setting below.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 90px 90px 110px', gap: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
            <span /><span style={{ textAlign: 'center' }}>In app</span><span style={{ textAlign: 'center' }}>Email</span><span style={{ textAlign: 'center' }}>Google Chat</span>
          </div>
          {EVENTS.map((row) => {
            const pref = prefOf(row.key);
            return (
              <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 90px 90px 110px', gap: 8, alignItems: 'center', minHeight: 44, padding: '0 16px', borderBottom: `1px solid ${color.divider}`, fontSize: 13.5 }}>
                <span>{row.label}</span>
                <span style={{ textAlign: 'center' }}>
                  <Checkbox checked={pref.inApp} onChange={(event) => patchPref(row.key, { inApp: event.target.checked })} />
                </span>
                <span style={{ textAlign: 'center' }}>
                  <Checkbox checked={pref.email} onChange={(event) => patchPref(row.key, { email: event.target.checked })} />
                </span>
                <span style={{ textAlign: 'center' }}>
                  <Checkbox
                    disabled={!chatColumnOn || !CHAT_KEY[row.key]}
                    checked={CHAT_KEY[row.key] ? chatPrefs[CHAT_KEY[row.key]!] : false}
                    onChange={(event) => {
                      const key = CHAT_KEY[row.key];
                      if (!key) return;
                      const next = { ...chatPrefs, [key]: event.target.checked };
                      setChatPrefs(next);
                      if (!chatColumnOn) return;
                      saveChat.mutate({ prefs: next }, { onError: (err) => setChatError(chatMessageOf(err)) });
                    }}
                  />
                </span>
              </div>
            );
          })}
          <div style={{ padding: '12px 16px', fontSize: 12.5, color: color.muted }}>
            {chatDmOn
              ? 'Direct messages come from the BornTask Chat app; a saved webhook is the fallback.'
              : chatAppOn
                ? 'The Chat column is on. A saved webhook receives posts until the Chat app service account is set on the server.'
                : 'Google Chat posts go to the space webhook you save above. Incoming webhooks cannot DM a person. The Chat column turns on when the BornTask Chat app is configured on the server.'}
          </div>
        </div>
      </section>
      <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <span style={{ flex: '1 1 280px' }}>
          <span style={{ display: 'block', fontWeight: 600 }}>Daily digest email</span>
          <span style={{ fontSize: 13, color: color.muted }}>What's due and what mentions you, once a day. Turn on one email per ticket below if you also want an email as things happen.</span>
        </span>
        <Select
          value={digestMode}
          onChange={setDigest}
          style={{ minWidth: 180, height: 38, padding: '0 12px' }}
          options={[
            { value: 'workdays', label: 'Workdays at 08:00' },
            { value: 'daily', label: 'Every day at 08:00' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </section>
      <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <span style={{ flex: '1 1 280px' }}>
          <span style={{ display: 'block', fontWeight: 600 }}>One email per ticket</span>
          <span style={{ fontSize: 13, color: color.muted }}>Send an email when you are assigned, mentioned or someone comments on a task you watch. Reply to that email to add a comment.</span>
        </span>
        <Checkbox checked={emailPerTask} onChange={(event) => setPerTask(event.target.checked)}>
          Send one email per event
        </Checkbox>
      </section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="primary" loading={busy} disabled={!dirty} onClick={() => void save()}>
          {saved && !dirty ? 'Saved' : 'Save changes'}
        </Button>
        {dirty && !busy && <span style={{ fontSize: 13, color: color.warning }}>Unsaved changes</span>}
      </div>
      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Google Chat?"
        confirmLabel="Disconnect"
        busy={disconnectChat.isPending}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setChatError(null);
          disconnectChat.mutate(undefined, {
            onSuccess: (next) => {
              setWebhookUrl('');
              setUrlDirty(false);
              setChatPrefs(next.prefs);
              setChatReady(true);
              setChatSaved(false);
              setConfirmDisconnect(false);
            },
            onError: (err) => setChatError(chatMessageOf(err)),
          });
        }}
      >
        This space will stop receiving your personal BornTask updates. You can connect it again later.
      </ConfirmDialog>
      {unsaved}
    </SettingsFrame>
  );
}
