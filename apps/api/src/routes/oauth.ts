import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, createTenantClient } from '../db.js';
import { requireAuth, setSession } from '../context.js';
import { sendError, forbidden } from '../errors.js';
import { getRedis } from '../lib/queue.js';
import { hashToken } from '../lib/tokens.js';
import { safeRedirect } from '../lib/oauthRedirect.js';

type PendingCode = {
  userId: string;
  tenantId: string;
  appName: string;
  redirectUri: string;
  scope: 'read' | 'read_write';
  codeChallenge: string | null;
};

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export const oauthRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const params = new URLSearchParams(String(body));
      const out: Record<string, string> = {};
      params.forEach((value, key) => {
        out[key] = value;
      });
      done(null, out);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post('/oauth/consent', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const body = z.object({
        appName: z.string().trim().min(1).max(80),
        redirectUri: z.string().min(1),
        scope: z.enum(['read', 'read_write']),
        state: z.string().optional(),
        codeChallenge: z.string().optional(),
        workspaceId: z.string().optional(),
      }).parse(req.body);
      const redirect = safeRedirect(body.redirectUri);
      let tenantId = auth.tenantId;
      let userId = auth.userId;
      if (body.workspaceId && body.workspaceId !== auth.tenantId) {
        const membership = await prisma.tenantMember.findUnique({
          where: { tenantId_userId: { tenantId: body.workspaceId, userId: auth.userId } },
        });
        if (!membership?.isActive) throw forbidden('You are not a member of that workspace.');
        tenantId = body.workspaceId;
        userId = auth.userId;
        setSession(req, reply, { userId, tenantId });
      }
      const code = randomBytes(32).toString('base64url');
      const pending: PendingCode = {
        userId,
        tenantId,
        appName: body.appName,
        redirectUri: redirect.toString(),
        scope: body.scope,
        codeChallenge: body.codeChallenge?.trim() || null,
      };
      await getRedis().set(`bt:oauth:${code}`, JSON.stringify(pending), 'EX', 600);
      const back = new URL(redirect.toString());
      back.searchParams.set('code', code);
      if (body.state) back.searchParams.set('state', body.state);
      return { redirectTo: back.toString() };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/oauth/token', async (req, reply) => {
    try {
      const body = z.object({
        grant_type: z.literal('authorization_code'),
        code: z.string().min(8),
        redirect_uri: z.string().min(1),
        code_verifier: z.string().optional(),
      }).parse(req.body);
      const key = `bt:oauth:${body.code}`;
      const raw = await getRedis().get(key);
      if (!raw) {
        return reply.code(400).send({ error: 'invalid_grant', error_description: 'This code has expired. Start the connection again.' });
      }
      await getRedis().del(key);
      const pending = JSON.parse(raw) as PendingCode;
      if (safeRedirect(body.redirect_uri).toString() !== pending.redirectUri) {
        return reply.code(400).send({ error: 'invalid_grant', error_description: 'The return address does not match.' });
      }
      if (pending.codeChallenge) {
        if (!body.code_verifier || s256(body.code_verifier) !== pending.codeChallenge) {
          return reply.code(400).send({ error: 'invalid_grant', error_description: 'The code verifier does not match.' });
        }
      }
      const db = createTenantClient(pending.tenantId);
      const host = safeRedirect(pending.redirectUri).host;
      let client = await db.oAuthClient.findFirst({ where: { appName: pending.appName, name: pending.appName } });
      if (!client) {
        client = await db.oAuthClient.create({
          data: {
            tenantId: pending.tenantId,
            name: pending.appName,
            appName: pending.appName,
            redirectHosts: [host],
          },
        });
      }
      const token = `bt_pat_${randomBytes(24).toString('base64url')}`;
      const minted = await db.apiToken.create({
        data: {
          tenantId: pending.tenantId,
          userId: pending.userId,
          name: pending.appName,
          tokenHash: hashToken(token),
          hint: token.slice(-4),
          scopes: pending.scope === 'read_write' ? ['read', 'write'] : ['read'],
        },
      });
      await db.oAuthGrant.create({
        data: {
          tenantId: pending.tenantId,
          clientId: client.id,
          userId: pending.userId,
          appName: pending.appName,
          redirectHost: host,
          scope: pending.scope,
          tokenId: minted.id,
        },
      });
      return {
        access_token: token,
        token_type: 'Bearer',
        scope: pending.scope,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
