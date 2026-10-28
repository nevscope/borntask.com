import type { FastifyPluginAsync } from 'fastify';
import {
  inboundCommentBody,
  inboundPlainFromParts,
  parseReplyAddress,
  parseSendGridEnvelope,
  resolveInboundSecret,
} from '@borntask/shared';
import { verifyReplyToken } from '../lib/replyToken.js';
import { prisma, createTenantClient } from '../db.js';
import { config } from '../env.js';
import { sendError, unauthorized, validation } from '../errors.js';
import { postComment } from '../lib/postComment.js';
import type { Authed } from '../context.js';

function field(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === 'string' ? value : '';
}

function requiredInboundSecret(): string | null {
  const resolved = resolveInboundSecret(process.env.SENDGRID_INBOUND_SECRET, process.env.NODE_ENV);
  if (resolved === 'missing') throw unauthorized('Inbound mail is not configured.');
  return resolved;
}

function applyFields(parts: { to: string; from: string; text: string; html: string }, name: string, value: string) {
  if (name === 'to') parts.to = value;
  if (name === 'envelope') {
    const envelope = parseSendGridEnvelope(value);
    if (envelope) {
      if (!parts.to && envelope.to) parts.to = envelope.to;
      if (!parts.from && envelope.from) parts.from = envelope.from;
    }
  }
  if (name === 'from') parts.from = value;
  if (name === 'text') parts.text = value;
  if (name === 'html') parts.html = value;
}

export const inboundMailRoutes: FastifyPluginAsync = async (app) => {
  app.post('/webhooks/inbound-mail', async (req, reply) => {
    try {
      const expected = requiredInboundSecret();
      if (expected) {
        const querySecret = typeof req.query === 'object' && req.query && 'secret' in req.query ? String((req.query as { secret?: string }).secret ?? '') : '';
        const got = String(req.headers['x-inbound-mail-secret'] ?? querySecret);
        if (got !== expected) throw unauthorized('Inbound mail secret does not match.');
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const parts = { to: '', from: '', text: '', html: '' };
      applyFields(parts, 'to', field(body, 'to'));
      applyFields(parts, 'from', field(body, 'from'));
      applyFields(parts, 'text', field(body, 'text'));
      applyFields(parts, 'html', field(body, 'html'));
      applyFields(parts, 'envelope', field(body, 'envelope'));
      if (req.isMultipart()) {
        for await (const part of req.parts()) {
          if (part.type !== 'field') continue;
          applyFields(parts, part.fieldname, String(part.value ?? ''));
        }
      }
      const to = parts.to;
      const from = parts.from;
      const text = inboundPlainFromParts(parts.text, parts.html);
      const domain = process.env.MAIL_REPLY_DOMAIN?.trim() || 'notify.borntask.com';
      const token = parseReplyAddress(to, domain);
      if (!token) throw validation('This address is not a BornTask reply mailbox.');
      const parsed = verifyReplyToken(token, config.sessionSecret);
      if (!parsed) throw unauthorized('This reply link is not valid.');
      const comment = inboundCommentBody(text);
      if (!comment) throw validation('The reply was empty.');
      const fromEmail = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
      const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
      if (!user || user.email.toLowerCase() !== fromEmail.toLowerCase()) {
        throw unauthorized('Reply from a different address than the notification.');
      }
      const task = await prisma.task.findFirst({
        where: { id: parsed.taskId, deletedAt: null },
        include: { project: true, status: true },
      });
      if (!task) throw validation('That task is gone.');
      const membership = await prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: task.tenantId, userId: user.id } },
      });
      if (!membership?.isActive) throw unauthorized('You are not in that workspace.');
      const auth: Authed = {
        userId: user.id,
        tenantId: task.tenantId,
        workspaceRole: membership.tenantRole,
        db: createTenantClient(task.tenantId),
        via: 'app',
        actorType: 'user',
        tokenScope: 'session',
      };
      await postComment(auth, task, comment);
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
