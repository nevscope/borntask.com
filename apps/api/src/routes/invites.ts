import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, createTenantClient } from '../db.js';
import { config } from '../env.js';
import { requireAuth, requireUser, setSession } from '../context.js';
import { forbidden as forbid, notFound as nf, sendError as send, validation as val } from '../errors.js';
import { hashToken, newInviteToken } from '../lib/tokens.js';

const createInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
  tenantRole: z.enum(['admin', 'member', 'guest', 'viewer']).default('member'),
  projectId: z.string().optional(),
  projectRoleSlugs: z.array(z.string()).optional(),
  message: z.string().max(1000).optional(),
});

export const inviteRoutes: FastifyPluginAsync = async (app) => {
  app.post('/invites', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const input = createInviteSchema.parse(req.body);
      if (auth.workspaceRole === 'guest' || auth.workspaceRole === 'viewer') {
        throw forbid('Guests and viewers cannot invite people.');
      }
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      if (!ws) throw nf();
      if (input.tenantRole === 'guest' && !ws.membersCanInviteGuests && auth.workspaceRole === 'member') {
        throw forbid('Only admins and leads can invite guests.');
      }
      const roleRows = input.projectRoleSlugs?.length
        ? await auth.db.projectRole.findMany({ where: { slug: { in: input.projectRoleSlugs } } })
        : [];
      const created: { email: string; url: string }[] = [];
      for (const emailRaw of input.emails) {
        const email = emailRaw.toLowerCase();
        const { token, hash } = newInviteToken();
        await auth.db.invitation.create({
          data: {
            tenantId: auth.tenantId,
            email,
            tenantRole: input.tenantRole,
            projectId: input.projectId,
            projectRoleIds: roleRows.map((r) => r.id),
            tokenHash: hash,
            invitedById: auth.userId,
            message: input.message,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        const url = `${config.publicUrl.replace(/\/$/, '')}/invite/${token}`;
        created.push({ email, url });
        req.log.info({ inviteUrl: url, email }, 'Invite URL (no Resend configured)');
        console.log(`[BornTask] Invite for ${email}: ${url}`);
      }
      return { invites: created };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.post('/invites/:token/accept', async (req, reply) => {
    try {
      const user = await requireUser(req);
      const token = (req.params as { token: string }).token;
      const invite = await prisma.invitation.findFirst({
        where: { tokenHash: hashToken(token) },
        include: { tenant: true },
      });
      if (!invite) throw val('Invitation not found.');
      if (invite.revokedAt) throw val('This invitation was revoked.');
      if (invite.acceptedAt) throw val('This invitation was already accepted.');
      if (invite.expiresAt.getTime() < Date.now()) throw val('This invitation has expired.');
      if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw val('Signed in with a different email than the invitation.');
      }

      const db = createTenantClient(invite.tenantId);
      const existing = await prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
      });
      if (!existing) {
        await prisma.tenantMember.create({
          data: { tenantId: invite.tenantId, userId: user.id, tenantRole: invite.tenantRole },
        });
      } else if (!existing.isActive) {
        await prisma.tenantMember.update({
          where: { id: existing.id },
          data: { isActive: true, tenantRole: invite.tenantRole },
        });
      }

      if (invite.projectId) {
        const member = await db.projectMember.upsert({
          where: { projectId_userId: { projectId: invite.projectId, userId: user.id } },
          update: {},
          create: { tenantId: invite.tenantId, projectId: invite.projectId, userId: user.id },
        });
        const roleIds = Array.isArray(invite.projectRoleIds) ? (invite.projectRoleIds as string[]) : [];
        for (const roleId of roleIds) {
          await db.projectMemberRole.upsert({
            where: { memberId_roleId: { memberId: member.id, roleId } },
            update: {},
            create: { tenantId: invite.tenantId, memberId: member.id, roleId },
          });
        }
      }

      await prisma.invitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      setSession(req, reply, { userId: user.id, tenantId: invite.tenantId });
      return {
        workspaceName: invite.tenant.name,
        tenantRole: invite.tenantRole,
        welcome: invite.tenantRole === 'guest' ? 'guest' : 'member',
      };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.post('/invites/:id/resend', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const invite = await auth.db.invitation.findFirst({ where: { id } });
      if (!invite) throw nf();
      if (invite.acceptedAt || invite.revokedAt) throw val('This invitation is no longer pending.');
      const { token, hash } = newInviteToken();
      await auth.db.invitation.update({
        where: { id: invite.id },
        data: { tokenHash: hash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });
      const url = `${config.publicUrl.replace(/\/$/, '')}/invite/${token}`;
      console.log(`[BornTask] Invite for ${invite.email}: ${url}`);
      return { email: invite.email, url };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.post('/invites/:id/revoke', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const invite = await auth.db.invitation.findFirst({ where: { id } });
      if (!invite) throw nf();
      await auth.db.invitation.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      return { ok: true };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.post('/invites/:token/wrong-account', async (req, reply) => {
    try {
      const user = await requireUser(req);
      const token = (req.params as { token: string }).token;
      const invite = await prisma.invitation.findFirst({ where: { tokenHash: hashToken(token) } });
      if (!invite) throw val('Invitation not found.');
      await prisma.inviteRequest.create({
        data: {
          tenantId: invite.tenantId,
          invitedEmail: invite.email,
          signedInEmail: user.email,
          requesterId: user.id,
          invitationId: invite.id,
        },
      });
      console.log(`[BornTask] Wrong-account request: ${user.email} asked for invite meant for ${invite.email}`);
      return { ok: true };
    } catch (err) {
      return send(reply, err);
    }
  });
};
