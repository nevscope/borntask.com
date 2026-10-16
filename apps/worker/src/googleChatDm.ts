import { createSign } from 'node:crypto';
import {
  findDirectMessageUrl,
  parseChatServiceAccount,
  setupDirectMessageBody,
  type ChatSendResult,
  type ChatServiceAccount,
} from '@borntask/shared';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CHAT_BOT_SCOPE = 'https://www.googleapis.com/auth/chat.bot';

type ChatFetch = (url: string, init?: RequestInit) => Promise<Response>;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
let warnedBadAccount = false;

export function clearChatBotTokenCache(): void {
  tokenCache.clear();
}

export function loadChatServiceAccount(env: NodeJS.ProcessEnv = process.env): ChatServiceAccount | null {
  const source = {
    json: env.GOOGLE_CHAT_APP_SERVICE_ACCOUNT_JSON,
    clientEmail: env.GOOGLE_CHAT_APP_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_CHAT_APP_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
  const account = parseChatServiceAccount(source);
  const hinted = Boolean(source.json?.trim() || source.clientEmail?.trim() || source.privateKey?.trim());
  if (!account && hinted && !warnedBadAccount) {
    warnedBadAccount = true;
    console.error('[chat] GOOGLE_CHAT_APP_SERVICE_ACCOUNT_* is set but not a usable key. Personal DMs stay off.');
  }
  return account;
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export function signChatBotJwt(account: ChatServiceAccount, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: account.clientEmail,
    scope: CHAT_BOT_SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(account.privateKey).toString('base64url')}`;
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message.slice(0, 180);
  } catch {
    // Google sometimes returns plain text.
  }
  return (text || `Google returned ${res.status}`).slice(0, 180);
}

async function accessToken(account: ChatServiceAccount, fetchImpl: ChatFetch): Promise<string> {
  const cached = tokenCache.get(account.clientEmail);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  let assertion: string;
  try {
    assertion = signChatBotJwt(account);
  } catch {
    throw new Error('Service account key could not sign a Chat token.');
  }
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Chat app token failed (${res.status}): ${await errorDetail(res)}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Chat app token response had no access_token.');
  tokenCache.set(account.clientEmail, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

function spaceName(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.startsWith('spaces/') ? name : '';
}

export async function sendChatAppDm(
  account: ChatServiceAccount,
  email: string,
  message: unknown,
  fetchImpl: ChatFetch = fetch,
): Promise<ChatSendResult> {
  const token = await accessToken(account, fetchImpl);
  const auth = { authorization: `Bearer ${token}` };
  const found = await fetchImpl(findDirectMessageUrl(email), {
    headers: auth,
    signal: AbortSignal.timeout(12_000),
  });
  let space = '';
  if (found.ok) {
    space = spaceName(await found.json());
  } else if (found.status !== 404) {
    return { ok: false, detail: `DM lookup failed (${found.status}): ${await errorDetail(found)}` };
  } else {
    await found.text();
  }
  if (!space) {
    // App auth can read an existing DM. Setup is documented as user auth; try it once on 404, then fall back.
    const setup = await fetchImpl('https://chat.googleapis.com/v1/spaces:setup', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(setupDirectMessageBody(email)),
      signal: AbortSignal.timeout(12_000),
    });
    if (!setup.ok) {
      return { ok: false, detail: `DM setup failed (${setup.status}): ${await errorDetail(setup)}` };
    }
    space = spaceName(await setup.json());
  }
  if (!space) return { ok: false, detail: 'Chat did not return a DM space.' };
  const posted = await fetchImpl(`https://chat.googleapis.com/v1/${space}/messages`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(12_000),
  });
  if (!posted.ok) {
    return { ok: false, detail: `DM message failed (${posted.status}): ${await errorDetail(posted)}` };
  }
  return { ok: true };
}
