import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { notFound, sendError } from '../errors.js';
import { hashToken } from '../lib/tokens.js';

function newPat(): { token: string; hash: string; hint: string } {
  const token = `bt_pat_${randomBytes(24).toString('base64url')}`;
  return { token, hash: hashToken(token), hint: token.slice(-4) };
}

function scopeList(scope: 'read' | 'read_write'): string[] {
  return scope === 'read_write' ? ['read', 'write'] : ['read'];
}

export const tokenRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/tokens', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const rows = await auth.db.apiToken.findMany({
        where: { userId: auth.userId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const grants = await auth.db.oAuthGrant.findMany({
        where: { userId: auth.userId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return {
        tokens: rows.map((row) => ({
          id: row.id,
          name: row.name,
          hint: row.hint,
          scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
          lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        grants: grants.map((row) => ({
          id: row.id,
          appName: row.appName,
          redirectHost: row.redirectHost,
          scope: row.scope,
          lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/me/tokens', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const body = z.object({
        name: z.string().trim().min(1, 'Give the token a name.').max(80, 'Name must be 80 characters or fewer.'),
        scope: z.enum(['read', 'read_write']),
      }).parse(req.body);
      const minted = newPat();
      const row = await auth.db.apiToken.create({
        data: {
          tenantId: auth.tenantId,
          userId: auth.userId,
          name: body.name,
          tokenHash: minted.hash,
          hint: minted.hint,
          scopes: scopeList(body.scope),
        },
      });
      return {
        id: row.id,
        name: row.name,
        token: minted.token,
        hint: minted.hint,
        scopes: scopeList(body.scope),
        lastUsedAt: null,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/me/tokens/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const row = await auth.db.apiToken.findFirst({ where: { id, userId: auth.userId, revokedAt: null } });
      if (!row) throw notFound('Token not found.');
      await auth.db.apiToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      await auth.db.oAuthGrant.updateMany({ where: { tokenId: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/me/grants/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const row = await auth.db.oAuthGrant.findFirst({ where: { id, userId: auth.userId, revokedAt: null } });
      if (!row) throw notFound('Connected app not found.');
      await auth.db.oAuthGrant.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      if (row.tokenId) {
        await auth.db.apiToken.updateMany({ where: { id: row.tokenId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
