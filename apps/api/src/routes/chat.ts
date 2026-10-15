import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  chatCard,
  chatMeta,
  defaultChatEvents,
  isChatWebhook,
  maskWebhook,
  parseChatEvents,
} from '@borntask/shared';
import { requireAuth, type Authed } from '../context.js';
import { config } from '../env.js';
import { forbidden, notFound, sendError, validation } from '../errors.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';

const eventsSchema = z.object({
  assigned: z.boolean(),
  ready_for_testing: z.boolean(),
  deployed: z.boolean(),
  mention: z.boolean(),
  status_change: z.boolean(),
  new_idea: z.boolean(),
});

async function projectFor(auth: Authed, key: string) {
  const project = await auth.db.project.findFirst({ where: { key } });
  if (!project) throw notFound('Project not found.');
  if (auth.workspaceRole === 'guest') {
    const on = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId: auth.userId } });
    if (!on) throw forbidden("You're not on this project.");
  }
  return project;
}

async function assertCanManage(auth: Authed, projectId: string, leadId: string | null) {
  if (auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin' || leadId === auth.userId) return;
  const member = await auth.db.projectMember.findFirst({
    where: { projectId, userId: auth.userId },
    include: { roles: { include: { role: true } } },
  });
  if (member?.roles.some((role) => role.role.slug === 'lead')) return;
  throw forbidden('Only a project lead or workspace admin can change Chat settings.');
}

function storedEvents(events: z.infer<typeof eventsSchema>, previous: unknown) {
  const meta = chatMeta(previous);
  return { ...events, lastPostedAt: meta.lastPostedAt, lastError: meta.lastError };
}

const REJECTED = 'Test failed: Google rejected the URL. Check it was copied in full.';

async function postChatWebhook(url: string, card: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(card),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ok: false, message: REJECTED };
    return { ok: true };
  } catch {
    return { ok: false, message: REJECTED };
  }
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:key/chat', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await projectFor(auth, key);
      const row = await auth.db.chatIntegration.findFirst({
        where: { projectId: project.id, provider: 'google_chat' },
      });
      if (!row) {
        return { connected: false, webhookMask: '', events: defaultChatEvents(), lastPostedAt: null, lastError: null };
      }
      let mask = '';
      try {
        mask = maskWebhook(decryptSecret(row.webhookUrlEnc, config.sessionSecret));
      } catch {
        mask = maskWebhook('');
      }
      const meta = chatMeta(row.events);
      return { connected: true, webhookMask: mask, events: parseChatEvents(row.events), ...meta };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/projects/:key/chat', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({
        webhookUrl: z.string().optional(),
        events: eventsSchema,
      }).parse(req.body);
      const project = await projectFor(auth, key);
      await assertCanManage(auth, project.id, project.leadId);
      const existing = await auth.db.chatIntegration.findFirst({
        where: { projectId: project.id, provider: 'google_chat' },
      });
      let webhookUrlEnc = existing?.webhookUrlEnc;
      if (body.webhookUrl?.trim()) {
        const url = body.webhookUrl.trim();
        if (!isChatWebhook(url)) {
          throw validation('That does not look like a Google Chat webhook. Copy the URL from Apps and integrations, then Webhooks.');
        }
        webhookUrlEnc = encryptSecret(url, config.sessionSecret);
      }
      if (!webhookUrlEnc) throw validation('Paste a webhook URL first.');
      const events = storedEvents(body.events, existing?.events);
      const row = existing
        ? await auth.db.chatIntegration.update({
            where: { id: existing.id },
            data: { webhookUrlEnc, events },
          })
        : await auth.db.chatIntegration.create({
            data: {
              tenantId: auth.tenantId,
              projectId: project.id,
              provider: 'google_chat',
              webhookUrlEnc,
              events,
            },
          });
      return {
        connected: true,
        webhookMask: maskWebhook(decryptSecret(row.webhookUrlEnc, config.sessionSecret)),
        events: parseChatEvents(row.events),
        ...chatMeta(row.events),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/chat/test', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ webhookUrl: z.string().optional() }).parse(req.body ?? {});
      const project = await projectFor(auth, key);
      await assertCanManage(auth, project.id, project.leadId);
      const existing = await auth.db.chatIntegration.findFirst({
        where: { projectId: project.id, provider: 'google_chat' },
      });
      let url = body.webhookUrl?.trim() ?? '';
      if (!url || url.includes('••••')) {
        if (!existing) throw validation('Paste a webhook URL first.');
        try {
          url = decryptSecret(existing.webhookUrlEnc, config.sessionSecret);
        } catch {
          throw validation(REJECTED);
        }
      }
      if (!isChatWebhook(url)) {
        throw validation('That does not look like a Google Chat webhook. Copy the URL from Apps and integrations, then Webhooks.');
      }
      const result = await postChatWebhook(url, chatCard({
        title: 'BornTask test message',
        subtitle: project.name,
        text: 'If you can read this, the space is connected. Task updates will arrive here.',
        url: `${config.publicUrl.replace(/\/$/, '')}/p/${encodeURIComponent(project.key)}/list`,
        button: 'Open project',
      }));
      if (existing) {
        const events = parseChatEvents(existing.events);
        const meta = chatMeta(existing.events);
        await auth.db.chatIntegration.update({
          where: { id: existing.id },
          data: {
            events: {
              ...events,
              lastPostedAt: result.ok ? new Date().toISOString() : meta.lastPostedAt,
              lastError: result.ok ? null : result.message,
            },
          },
        });
      }
      if (!result.ok) throw validation(result.message);
      return { ok: true, lastPostedAt: new Date().toISOString(), lastError: null };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/projects/:key/chat', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await projectFor(auth, key);
      await assertCanManage(auth, project.id, project.leadId);
      await auth.db.chatIntegration.deleteMany({ where: { projectId: project.id, provider: 'google_chat' } });
      return { connected: false, webhookMask: '', events: defaultChatEvents(), lastPostedAt: null, lastError: null };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
