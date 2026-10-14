import type { AuthProvider } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { config } from '../env.js';
import { setSession } from '../context.js';
import { hashToken } from './tokens.js';

export async function finishLogin(
  req: FastifyRequest,
  reply: FastifyReply,
  profile: { email: string; name: string; providerId?: string; provider?: AuthProvider },
) {
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
    where: { userId: user.id, isActive: true },
    include: { tenant: true },
    orderBy: { createdAt: 'asc' },
  });

  let tenantId = memberships[0]?.tenantId;
  const existingTenant = req.session.get('tenantId') as string | undefined;
  if (existingTenant && memberships.some((m) => m.tenantId === existingTenant)) {
    tenantId = existingTenant;
  }

  setSession(req, reply, { userId: user.id, tenantId });

  const web = config.publicUrl.replace(/\/$/, '');
  if (inviteToken) {
    const invite = await prisma.invitation.findFirst({ where: { tokenHash: hashToken(inviteToken) } });
    if (invite && invite.email.toLowerCase() !== email) {
      return reply.redirect(`${web}/invite/${inviteToken}/wrong-account`);
    }
    return reply.redirect(`${web}/invite/${inviteToken}`);
  }
  if (!tenantId) return reply.redirect(`${web}/create-workspace`);
  return reply.redirect(`${web}/`);
}
