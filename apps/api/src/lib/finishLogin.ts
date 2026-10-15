import type { AuthProvider } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { setSession } from '../context.js';
import { normaliseDomain } from './inviteRole.js';
import { hashToken } from './tokens.js';

/** Signs the user in and returns the web path they should open next. */
export async function finishLogin(
  req: FastifyRequest,
  reply: FastifyReply,
  profile: { email: string; name: string; providerId?: string; provider?: AuthProvider },
): Promise<string> {
  const email = profile.email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: profile.name,
      authProvider: profile.provider ?? undefined,
      providerId: profile.providerId ?? undefined,
    },
    create: {
      email,
      name: profile.name,
      authProvider: profile.provider ?? undefined,
      providerId: profile.providerId ?? undefined,
    },
  });

  const inviteToken = (req.session.get('inviteToken') as string | undefined) ?? undefined;
  req.session.set('inviteToken', undefined);

  const memberships = await prisma.tenantMember.findMany({
    where: { userId: user.id, isActive: true, tenant: { deletedAt: null } },
    include: { tenant: true },
    orderBy: { createdAt: 'asc' },
  });

  let tenantId = memberships[0]?.tenantId;
  const existingTenant = req.session.get('tenantId') as string | undefined;
  if (existingTenant && memberships.some((m) => m.tenantId === existingTenant)) {
    tenantId = existingTenant;
  }

  if (!tenantId) {
    const domain = email.split('@')[1] ?? '';
    const open = await prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, allowedDomains: true },
      orderBy: { createdAt: 'asc' },
    });
    const match = open.find((w) => Array.isArray(w.allowedDomains) && w.allowedDomains.some((d) => typeof d === 'string' && normaliseDomain(d) === domain));
    if (match && domain) {
      await prisma.tenantMember.create({
        data: { tenantId: match.id, userId: user.id, tenantRole: 'member' },
      });
      tenantId = match.id;
    }
  }

  setSession(req, reply, { userId: user.id, tenantId });

  if (inviteToken) {
    const invite = await prisma.invitation.findFirst({ where: { tokenHash: hashToken(inviteToken) } });
    if (invite && invite.email.toLowerCase() !== email) {
      return `/invite/${inviteToken}/wrong-account`;
    }
    return `/invite/${inviteToken}`;
  }
  if (!tenantId) return '/create-workspace';
  return '/';
}
