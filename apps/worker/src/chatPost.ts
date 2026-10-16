import { PrismaClient } from '@prisma/client';
import { chatCard, chatMeta, deliverPersonalChat, parseChatEvents, type ChatPostJob } from '@borntask/shared';
import { loadChatServiceAccount, sendChatAppDm } from './googleChatDm.js';
import { decryptSecret } from './secrets.js';

const prisma = new PrismaClient();

function cardFor(data: ChatPostJob) {
  return chatCard({
    title: data.title,
    subtitle: `${data.projectName} · ${data.taskKey}`,
    text: data.text,
    url: data.url,
    button: data.event === 'new_idea' ? 'Review idea' : 'Open task',
  });
}

async function postPersonalWebhook(url: string, message: unknown): Promise<{ ok: true } | { ok: false; detail: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 180);
    return { ok: false, detail: detail || `Google returned ${res.status}` };
  }
  return { ok: true };
}

async function runPersonalChatPost(data: ChatPostJob & { userId: string }) {
  const pref = await prisma.notificationPreference.findUnique({
    where: {
      userId_tenantId_event_channel: {
        userId: data.userId,
        tenantId: data.tenantId,
        event: data.event,
        channel: 'google_chat',
      },
    },
  });
  if (!pref?.enabled) return { ok: true, skipped: 'event_off' as const };

  const row = await prisma.chatIntegration.findFirst({
    where: { tenantId: data.tenantId, userId: data.userId, projectId: null, provider: 'google_chat' },
  });
  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { email: true } });
  const account = loadChatServiceAccount();
  const secret = process.env.SESSION_SECRET ?? 'borntask-local-dev-session-secret-change-me';
  let webhookUrl: string | null = null;
  let webhookBroken = false;
  if (row) {
    try {
      webhookUrl = decryptSecret(row.webhookUrlEnc, secret).trim() || null;
    } catch {
      webhookBroken = true;
    }
  }

  const result = await deliverPersonalChat(
    {
      serviceAccountConfigured: account !== null,
      email: user?.email ?? null,
      webhookUrl: webhookBroken ? 'stored' : webhookUrl,
    },
    cardFor(data),
    {
      sendDm: (email, message) => {
        if (!account) return Promise.resolve({ ok: false, detail: 'Chat app service account is not configured.' });
        return sendChatAppDm(account, email, message);
      },
      postWebhook: (url, message) => webhookBroken
        ? Promise.resolve({ ok: false, detail: 'The saved personal webhook could not be read.' })
        : postPersonalWebhook(url, message),
    },
  );

  const failed = result.ok ? null : result.lastError;
  if (failed) console.error(`[chat] personal ${data.userId}: ${failed}`);
  else if (result.ok && result.via === 'webhook' && result.dmError) {
    console.error(`[chat] personal ${data.userId}: DM failed, used webhook. ${result.dmError}`);
  }

  if (row) {
    const meta = chatMeta(row.events);
    await prisma.chatIntegration.update({
      where: { id: row.id },
      data: {
        events: {
          ...meta,
          lastPostedAt: result.ok ? new Date().toISOString() : meta.lastPostedAt,
          lastError: result.ok ? null : failed,
        },
      },
    });
  }

  if (!result.ok) return { ok: true, delivered: false, lastError: failed };
  return { ok: true, via: result.via };
}

async function runProjectChatPost(data: ChatPostJob) {
  const row = await prisma.chatIntegration.findFirst({
    where: { tenantId: data.tenantId, projectId: data.projectId, userId: null, provider: 'google_chat' },
  });
  if (!row) return { ok: true, skipped: 'not_connected' as const };
  const events = parseChatEvents(row.events);
  if (!(data.event in events) || !events[data.event as keyof typeof events]) {
    return { ok: true, skipped: 'event_off' as const };
  }
  const secret = process.env.SESSION_SECRET ?? 'borntask-local-dev-session-secret-change-me';
  const url = decryptSecret(row.webhookUrlEnc, secret);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(cardFor(data)),
    signal: AbortSignal.timeout(12_000),
  });
  const meta = chatMeta(row.events);
  const stored = { ...events, ...meta };
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 240);
    await prisma.chatIntegration.update({
      where: { id: row.id },
      data: { events: { ...stored, lastError: detail || `Google returned ${res.status}` } },
    });
    throw new Error(`Chat webhook returned ${res.status}`);
  }
  await prisma.chatIntegration.update({
    where: { id: row.id },
    data: { events: { ...stored, lastPostedAt: new Date().toISOString(), lastError: null } },
  });
  return { ok: true };
}

export async function runChatPost(data: ChatPostJob) {
  if (data.userId) return runPersonalChatPost({ ...data, userId: data.userId });
  return runProjectChatPost(data);
}
