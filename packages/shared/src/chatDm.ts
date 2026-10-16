export type ChatServiceAccount = {
  clientEmail: string;
  privateKey: string;
};

export type ChatSendResult = { ok: true } | { ok: false; detail: string };

export type PersonalChatDelivery = {
  serviceAccountConfigured: boolean;
  email: string | null;
  webhookUrl: string | null;
};

export type PersonalChatDeliveryResult =
  | { ok: true; via: 'dm' }
  | { ok: true; via: 'webhook'; dmError: string | null }
  | { ok: false; lastError: string };

const NO_DM =
  'Google Chat DMs need a service account on the server, and no personal webhook is saved.';

function clip(value: string): string {
  return value.slice(0, 240);
}

function usableAccount(clientEmail: string, privateKey: string): ChatServiceAccount | null {
  const email = clientEmail.trim();
  const key = privateKey.replace(/\\n/g, '\n');
  if (!email.includes('@') || !key.includes('PRIVATE KEY')) return null;
  return { clientEmail: email, privateKey: key };
}

export function parseChatServiceAccount(source: {
  json?: string;
  clientEmail?: string;
  privateKey?: string;
}): ChatServiceAccount | null {
  const json = source.json?.trim() ?? '';
  if (json) {
    try {
      const parsed = JSON.parse(json) as { client_email?: unknown; private_key?: unknown };
      const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email : '';
      const privateKey = typeof parsed.private_key === 'string' ? parsed.private_key : '';
      return usableAccount(clientEmail, privateKey);
    } catch {
      return null;
    }
  }
  return usableAccount(source.clientEmail ?? '', source.privateKey ?? '');
}

export function chatUserResource(email: string): string {
  return `users/${email.trim().toLowerCase()}`;
}

export function findDirectMessageUrl(email: string): string {
  return `https://chat.googleapis.com/v1/spaces:findDirectMessage?name=${encodeURIComponent(chatUserResource(email))}`;
}

export function setupDirectMessageBody(email: string) {
  return {
    space: { spaceType: 'DIRECT_MESSAGE' as const, singleUserBotDm: true },
    memberships: [{ member: { name: chatUserResource(email), type: 'HUMAN' as const } }],
  };
}

async function attempt(run: () => Promise<ChatSendResult>): Promise<ChatSendResult> {
  try {
    return await run();
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Chat request failed.';
    return { ok: false, detail: clip(detail) };
  }
}

/**
 * Personal events: DM as the Chat app, then the person's saved webhook.
 * The project space webhook is not an input here.
 */
export async function deliverPersonalChat(
  input: PersonalChatDelivery,
  message: unknown,
  deps: {
    sendDm: (email: string, message: unknown) => Promise<ChatSendResult>;
    postWebhook: (url: string, message: unknown) => Promise<ChatSendResult>;
  },
): Promise<PersonalChatDeliveryResult> {
  let dmError: string | null = null;
  if (input.serviceAccountConfigured) {
    const email = input.email?.trim().toLowerCase() ?? '';
    if (!email) {
      dmError = 'No login email, so BornTask cannot open a Chat DM.';
    } else {
      const dm = await attempt(() => deps.sendDm(email, message));
      if (dm.ok) return { ok: true, via: 'dm' };
      dmError = dm.detail;
    }
  }
  if (input.webhookUrl) {
    const hook = await attempt(() => deps.postWebhook(input.webhookUrl as string, message));
    if (hook.ok) return { ok: true, via: 'webhook', dmError };
    const lastError = dmError ? `${dmError} Webhook fallback failed: ${hook.detail}` : hook.detail;
    return { ok: false, lastError: clip(lastError) };
  }
  if (dmError) {
    return { ok: false, lastError: clip(`${dmError} No personal webhook is saved.`) };
  }
  return { ok: false, lastError: NO_DM };
}
