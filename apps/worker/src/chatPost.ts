import { PrismaClient } from '@prisma/client';
import { chatCard, chatMeta, parseChatEvents, type ChatPostJob } from '@borntask/shared';
import { decryptSecret } from './secrets.js';

const prisma = new PrismaClient();

export async function runChatPost(data: ChatPostJob) {
  const row = data.userId
    ? await prisma.chatIntegration.findFirst({
      where: { tenantId: data.tenantId, userId: data.userId, projectId: null, provider: 'google_chat' },
    })
    : await prisma.chatIntegration.findFirst({
      where: { tenantId: data.tenantId, projectId: data.projectId, userId: null, provider: 'google_chat' },
    });
  if (!row) return { ok: true, skipped: 'not_connected' };
  if (data.userId) {
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
    if (!pref?.enabled) return { ok: true, skipped: 'event_off' };
  } else {
    const events = parseChatEvents(row.events);
    if (!(data.event in events) || !events[data.event as keyof typeof events]) {
      return { ok: true, skipped: 'event_off' };
    }
  }
  const secret = process.env.SESSION_SECRET ?? 'borntask-local-dev-session-secret-change-me';
  const url = decryptSecret(row.webhookUrlEnc, secret);
  // Personal DMs need the Chat app + Workspace allowlist. Until the app can DM,
  // this job keeps posting to the personal space webhook when one is stored.
  const card = chatCard({
    title: data.title,
    subtitle: `${data.projectName} · ${data.taskKey}`,
    text: data.text,
    url: data.url,
    button: data.event === 'new_idea' ? 'Review idea' : 'Open task',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(card),
    signal: AbortSignal.timeout(12_000),
  });
  const events = parseChatEvents(row.events);
  const meta = chatMeta(row.events);
  const stored = data.userId ? { ...meta } : { ...events, ...meta };
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
