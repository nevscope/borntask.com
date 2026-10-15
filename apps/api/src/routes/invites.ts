import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, createTenantClient } from '../db.js';
import { config } from '../env.js';
import { requireAuth, requireUser, setSession } from '../context.js';
import { forbidden as forbid, notFound as nf, sendError as send, validation as val } from '../errors.js';
import { remapRoleSlug } from '../lib/mappers.js';
import { internalDomains, roleForInvite } from '../lib/inviteRole.js';
import { enqueueMail, roleLabel } from '../lib/enqueueMail.js';
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
      const roleRows = input.projectRoleSlugs?.length
        ? await auth.db.projectRole.findMany({ where: { slug: { in: input.projectRoleSlugs } } })
        : [];
      const actor = await prisma.user.findUnique({ where: { id: auth.userId } });
      const domains = internalDomains(ws.allowedDomains, actor?.email ?? '');
      const created: { email: string; url: string; tenantRole: string }[] = [];
      for (const emailRaw of input.emails) {
        const email = emailRaw.toLowerCase();
        const tenantRole = roleForInvite(email, input.tenantRole, domains);
        if (tenantRole === 'guest' && !ws.membersCanInviteGuests && auth.workspaceRole === 'member') {
          throw forbid('Only admins and leads can invite guests.');
        }
        const { token, hash } = newInviteToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await auth.db.invitation.create({
          data: {
            tenantId: auth.tenantId,
            email,
            tenantRole,
            projectId: input.projectId,
            projectRoleIds: roleRows.map((r) => r.id),
            tokenHash: hash,
            invitedById: auth.userId,
            message: input.message,
            expiresAt,
          },
        });
        const url = `${config.publicUrl.replace(/\/$/, '')}/invite/${token}`;
        created.push({ email, url, tenantRole });
        await enqueueMail({
          kind: 'invite',
          to: email,
          inviteUrl: url,
          workspaceName: ws.name,
          inviterName: actor?.name ?? 'A teammate',
          roleLabel: roleLabel(tenantRole, roleRows[0]?.name),
          message: input.message ?? null,
          expiresAt: expiresAt.toISOString(),
        });
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
      let projectKey: string | null = null;
      let projectName: string | null = null;
      let projectRole: string | null = null;
      if (invite.projectId) {
        const project = await db.project.findFirst({ where: { id: invite.projectId } });
        projectKey = project?.key ?? null;
        projectName = project?.name ?? null;
        const roleIds = Array.isArray(invite.projectRoleIds) ? (invite.projectRoleIds as string[]) : [];
        const roleId = roleIds[0];
        if (roleId) {
          const role = await db.projectRole.findFirst({ where: { id: roleId } });
          if (role) projectRole = remapRoleSlug(role.slug);
        }
      }
      return {
        workspaceName: invite.tenant.name,
        tenantRole: invite.tenantRole,
        welcome: invite.tenantRole === 'guest' ? 'guest' : 'member',
        projectKey,
        projectName,
        projectRole,
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
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await auth.db.invitation.update({
        where: { id: invite.id },
        data: { tokenHash: hash, expiresAt },
      });
      const url = `${config.publicUrl.replace(/\/$/, '')}/invite/${token}`;
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      const actor = await prisma.user.findUnique({ where: { id: auth.userId } });
      const roleIds = Array.isArray(invite.projectRoleIds) ? (invite.projectRoleIds as string[]) : [];
      const role = roleIds[0] ? await auth.db.projectRole.findFirst({ where: { id: roleIds[0] } }) : null;
      await enqueueMail({
        kind: 'invite',
        to: invite.email,
        inviteUrl: url,
        workspaceName: ws?.name ?? 'BornTask',
        inviterName: actor?.name ?? 'A teammate',
        roleLabel: roleLabel(invite.tenantRole, role?.name),
        message: invite.message,
        expiresAt: expiresAt.toISOString(),
      });
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
      const [inviter, ws] = await Promise.all([
        prisma.user.findUnique({ where: { id: invite.invitedById } }),
        prisma.workspace.findUnique({ where: { id: invite.tenantId } }),
      ]);
      if (inviter?.email) {
        await enqueueMail({
          kind: 'wrong-account',
          to: inviter.email,
          requesterName: user.name,
          requesterEmail: user.email,
          invitedEmail: invite.email,
          workspaceName: ws?.name ?? 'the workspace',
          peopleUrl: `${config.publicUrl.replace(/\/$/, '')}/settings/people`,
        });
      }
      return { ok: true };
    } catch (err) {
      return send(reply, err);
    }
  });
};
