import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { chatAppEnabled, config } from '../env.js';
import { sendError, unauthorized } from '../errors.js';
import { handleChatAppEvent, verifyChatAppRequest } from '../lib/chatApp.js';

export const chatAppRoutes: FastifyPluginAsync = async (app) => {
  app.get('/chat/app/status', async (req, reply) => {
    try {
      await requireAuth(req);
      return {
        configured: chatAppEnabled(),
        // Ops (do not run from this API): Google Cloud project, enable Chat API,
        // list the app, Workspace allowlist. DMs need that plus a Chat service
        // account. Until then personal space webhooks remain the fallback.
        docs: 'https://developers.google.com/workspace/chat/quickstart/gcf-app',
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/chat/app', async (req, reply) => {
    try {
      if (!chatAppEnabled() || !verifyChatAppRequest(req.headers.authorization)) {
        throw unauthorized('Google Chat app is not configured, or the verification token did not match.');
      }
      const event = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      return await handleChatAppEvent(event);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/internal/chat-app-job', async (req, reply) => {
    try {
      if (req.headers['x-borntask-job'] !== config.sessionSecret) throw unauthorized();
      const body = z.object({ event: z.record(z.unknown()) }).parse(req.body);
      return await handleChatAppEvent(body.event);
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
