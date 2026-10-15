import { PrismaClient } from '@prisma/client';
import { chatCard, chatMeta, parseChatEvents, type ChatPostJob } from '@borntask/shared';
import { decryptSecret } from './secrets.js';

const prisma = new PrismaClient();

export async function runChatPost(data: ChatPostJob) {
  const row = await prisma.chatIntegration.findFirst({
    where: { tenantId: data.tenantId, projectId: data.projectId, provider: 'google_chat' },
  });
  if (!row) return { ok: true, skipped: 'not_connected' };
  const events = parseChatEvents(row.events);
  if (!events[data.event]) return { ok: true, skipped: 'event_off' };
  const secret = process.env.SESSION_SECRET ?? 'borntask-local-dev-session-secret-change-me';
  const url = decryptSecret(row.webhookUrlEnc, secret);
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
  const meta = chatMeta(row.events);
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 240);
    await prisma.chatIntegration.update({
      where: { id: row.id },
      data: { events: { ...events, ...meta, lastError: detail || `Google returned ${res.status}` } },
    });
    throw new Error(`Chat webhook returned ${res.status}`);
  }
  await prisma.chatIntegration.update({
    where: { id: row.id },
    data: { events: { ...events, lastPostedAt: new Date().toISOString(), lastError: null } },
  });
  return { ok: true };
}
