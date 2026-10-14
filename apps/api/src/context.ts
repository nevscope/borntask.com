import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, createTenantClient } from './db.js';
import { forbidden, unauthorized } from './errors.js';

export type Authed = {
  userId: string;
  tenantId: string;
  workspaceRole: 'owner' | 'admin' | 'member' | 'guest' | 'viewer';
  db: ReturnType<typeof createTenantClient>;
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

export async function requireAuth(req: FastifyRequest): Promise<Authed> {
  const user = await requireUser(req);
  const tenantId = sessionTenantId(req);
  if (!tenantId) throw unauthorized();
  const membership = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
  });
  if (!membership || !membership.isActive) throw forbidden('You are not a member of this workspace.');
  return {
    userId: user.id,
    tenantId,
    workspaceRole: membership.tenantRole,
    db: createTenantClient(tenantId),
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
