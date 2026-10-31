import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, createTenantClient } from './db.js';
import { forbidden, notFound, unauthorized } from './errors.js';
import { hashToken } from './lib/tokens.js';
import { tokenAllows } from './lib/tokenPolicy.js';
import { workspaceSlugFromRequest } from './lib/workspaceHost.js';

export type Authed = {
  userId: string;
  tenantId: string;
  workspaceRole: 'owner' | 'admin' | 'member' | 'guest' | 'viewer';
  db: ReturnType<typeof createTenantClient>;
  via: 'app' | 'mcp' | 'github';
  actorType: 'user' | 'mcp' | 'automation';
  tokenScope: 'session' | 'read' | 'read_write';
};

export function sessionUserId(req: FastifyRequest): string | undefined {
  return req.session.get('userId') as string | undefined;
}

export function sessionTenantId(req: FastifyRequest): string | undefined {
  const id = req.session.get('tenantId');
  return id ? id : undefined;
}

export async function requireUser(req: FastifyRequest) {
  const userId = sessionUserId(req);
  if (!userId) throw unauthorized();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return user;
}

function bearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token?.startsWith('bt_pat_')) return undefined;
  return token.trim();
}

async function membershipFor(userId: string, tenantId: string) {
  const membership = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
  if (!membership || !membership.isActive) throw forbidden('You are not a member of this workspace.');
  const workspace = await prisma.workspace.findUnique({ where: { id: tenantId }, select: { deletedAt: true } });
  if (!workspace || workspace.deletedAt) throw forbidden('This workspace is closed.');
  return membership;
}

export async function requireAuth(req: FastifyRequest): Promise<Authed> {
  if (req.headers.authorization) {
    const token = bearerToken(req);
    if (!token) throw unauthorized('Use a personal token that starts with bt_pat_.');
    const row = await prisma.apiToken.findFirst({ where: { tokenHash: hashToken(token), revokedAt: null } });
    if (!row) throw unauthorized('This token is not valid. Create a new one in API tokens.');
    const membership = await membershipFor(row.userId, row.tenantId);
    const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) : [];
    const tokenScope = scopes.includes('write') || scopes.includes('read_write') ? 'read_write' : 'read';
    const viaHeader = req.headers['x-borntask-via'];
    const via = viaHeader === 'mcp' ? 'mcp' : 'app';
    const decision = tokenAllows(req.method, req.url, tokenScope);
    if (!decision.ok) throw forbidden(decision.message);
    void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    void prisma.oAuthGrant.updateMany({ where: { tokenId: row.id, revokedAt: null }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return {
      userId: row.userId,
      tenantId: row.tenantId,
      workspaceRole: membership.tenantRole,
      db: createTenantClient(row.tenantId),
      via,
      actorType: via === 'mcp' ? 'mcp' : 'user',
      tokenScope,
    };
  }

  const user = await requireUser(req);
  const hostSlug = workspaceSlugFromRequest(req);
  if (hostSlug) {
    const workspace = await prisma.workspace.findUnique({ where: { slug: hostSlug } });
    if (!workspace || workspace.deletedAt) throw notFound('This workspace address was not found.');
    const membership = await membershipFor(user.id, workspace.id);
    return {
      userId: user.id,
      tenantId: workspace.id,
      workspaceRole: membership.tenantRole,
      db: createTenantClient(workspace.id),
      via: 'app',
      actorType: 'user',
      tokenScope: 'session',
    };
  }
  const tenantId = sessionTenantId(req);
  if (!tenantId) throw unauthorized();
  const membership = await membershipFor(user.id, tenantId);
  return {
    userId: user.id,
    tenantId,
    workspaceRole: membership.tenantRole,
    db: createTenantClient(tenantId),
    via: 'app',
    actorType: 'user',
    tokenScope: 'session',
  };
}

export function setSession(req: FastifyRequest, _reply: FastifyReply, data: { userId: string; tenantId?: string }) {
  req.session.set('userId', data.userId);
  req.session.set('tenantId', data.tenantId ?? '');
}

export function clearSession(req: FastifyRequest) {
  req.session.delete();
}

export function withTenant<T extends object>(tenantId: string, data: T): T & { tenantId: string } {
  return { ...data, tenantId };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}
