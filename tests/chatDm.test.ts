import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  deliverPersonalChat,
  findDirectMessageUrl,
  parseChatServiceAccount,
  setupDirectMessageBody,
} from '../packages/shared/src/chatDm.ts';
import { clearChatBotTokenCache, sendChatAppDm, signChatBotJwt } from '../apps/worker/src/googleChatDm.ts';

const WEBHOOK = 'https://chat.googleapis.com/v1/spaces/SPACE/messages?key=test';
const MESSAGE = { text: 'Assigned WEB-12' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function account() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  return {
    clientEmail: `bot-${Math.random().toString(16).slice(2)}@example.iam.gserviceaccount.com`,
    privateKey: typeof pem === 'string' ? pem : pem.toString(),
  };
}

describe('service account', () => {
  test('empty env does not count as a Chat app that can DM', () => {
    expect(parseChatServiceAccount({})).toBeNull();
    expect(parseChatServiceAccount({ json: 'not-json' })).toBeNull();
    expect(parseChatServiceAccount({ clientEmail: 'bot@example.iam.gserviceaccount.com', privateKey: 'short' })).toBeNull();
  });

  test('reads client_email and private_key from the JSON env', () => {
    const parsed = parseChatServiceAccount({
      json: JSON.stringify({
        client_email: 'bot@example.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
      }),
    });
    expect(parsed?.clientEmail).toBe('bot@example.iam.gserviceaccount.com');
    expect(parsed?.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(parsed?.privateKey).not.toContain('\\n');
  });
});

describe('Chat app JWT', () => {
  test('uses chat.bot and does not impersonate a user', () => {
    const jwt = signChatBotJwt(account(), 1_700_000_000);
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString()) as Record<string, unknown>;
    expect(payload.scope).toBe('https://www.googleapis.com/auth/chat.bot');
    expect(payload.aud).toBe('https://oauth2.googleapis.com/token');
    expect(payload.sub).toBeUndefined();
  });
});

describe('DM first, webhook second', () => {
  test('a successful DM does not call the personal webhook', async () => {
    const webhooks: string[] = [];
    const result = await deliverPersonalChat(
      { serviceAccountConfigured: true, email: 'Ada@Example.com', webhookUrl: WEBHOOK },
      MESSAGE,
      {
        sendDm: async (email) => {
          expect(email).toBe('ada@example.com');
          return { ok: true };
        },
        postWebhook: async (url) => {
          webhooks.push(url);
          return { ok: true };
        },
      },
    );
    expect(result).toEqual({ ok: true, via: 'dm' });
    expect(webhooks).toEqual([]);
  });

  test('a 403 from Chat falls back to the personal webhook', async () => {
    clearChatBotTokenCache();
    const bot = account();
    const calls: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('oauth2.googleapis.com')) return json({ access_token: 'tok', expires_in: 3600 });
      if (url.includes('findDirectMessage')) return json({ error: { message: 'not found' } }, 404);
      if (url.includes('spaces:setup')) {
        const body = JSON.parse(String(init?.body)) as { space: { singleUserBotDm: boolean }; memberships: { member: { name: string } }[] };
        expect(body.space.singleUserBotDm).toBe(true);
        expect(body.memberships[0]?.member.name).toBe('users/ada@example.com');
        return json({ error: { message: 'The app is not allowed to message this user.' } }, 403);
      }
      throw new Error(`unexpected ${url}`);
    };
    const webhooks: string[] = [];
    const result = await deliverPersonalChat(
      { serviceAccountConfigured: true, email: 'Ada@Example.com', webhookUrl: WEBHOOK },
      MESSAGE,
      {
        sendDm: (email, message) => sendChatAppDm(bot, email, message, fetchImpl),
        postWebhook: async (url) => {
          webhooks.push(url);
          return { ok: true };
        },
      },
    );
    expect(result).toMatchObject({ ok: true, via: 'webhook' });
    expect(webhooks).toEqual([WEBHOOK]);
    expect(calls.some((line) => line.includes('findDirectMessage') && line.includes(encodeURIComponent('users/ada@example.com')))).toBe(true);
    expect(calls.some((line) => line.startsWith('POST') && line.includes('/messages'))).toBe(false);
  });

  test('reuses a DM space and posts messages.create as the app', async () => {
    clearChatBotTokenCache();
    const bot = account();
    const calls: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('oauth2.googleapis.com')) return json({ access_token: 'tok', expires_in: 3600 });
      if (url.includes('findDirectMessage')) return json({ name: 'spaces/DM1' });
      if (url.endsWith('/spaces/DM1/messages')) return json({ name: 'spaces/DM1/messages/m1' });
      throw new Error(`unexpected ${url}`);
    };
    const result = await sendChatAppDm(bot, 'ada@example.com', MESSAGE, fetchImpl);
    expect(result).toEqual({ ok: true });
    expect(calls).toContain('POST https://chat.googleapis.com/v1/spaces/DM1/messages');
    expect(findDirectMessageUrl('ada@example.com')).toContain(encodeURIComponent('users/ada@example.com'));
    expect(setupDirectMessageBody('ada@example.com').memberships[0]?.member.name).toBe('users/ada@example.com');
  });

  test('when neither DM nor webhook works, lastError is returned and nothing throws', async () => {
    let threw = false;
    let result: Awaited<ReturnType<typeof deliverPersonalChat>> | null = null;
    try {
      result = await deliverPersonalChat(
        { serviceAccountConfigured: true, email: 'ada@example.com', webhookUrl: WEBHOOK },
        MESSAGE,
        {
          sendDm: async () => ({ ok: false, detail: 'DM setup failed (403): not allowlisted' }),
          postWebhook: async () => ({ ok: false, detail: 'Google returned 400' }),
        },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(result.lastError).toContain('403');
      expect(result.lastError).toContain('Webhook fallback failed');
    }
  });

  test('without a service account the DM is not attempted', async () => {
    const dms: string[] = [];
    const result = await deliverPersonalChat(
      { serviceAccountConfigured: false, email: 'ada@example.com', webhookUrl: WEBHOOK },
      MESSAGE,
      {
        sendDm: async () => {
          dms.push('called');
          return { ok: true };
        },
        postWebhook: async () => ({ ok: true }),
      },
    );
    expect(dms).toEqual([]);
    expect(result).toEqual({ ok: true, via: 'webhook', dmError: null });
  });

  test('without a service account or a webhook, lastError does not claim a DM was sent', async () => {
    const result = await deliverPersonalChat(
      { serviceAccountConfigured: false, email: 'ada@example.com', webhookUrl: null },
      MESSAGE,
      {
        sendDm: async () => ({ ok: true }),
        postWebhook: async () => ({ ok: true }),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.lastError).toMatch(/service account/i);
  });
});
