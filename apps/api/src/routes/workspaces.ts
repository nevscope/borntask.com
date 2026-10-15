import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, createTenantClient } from '../db.js';
import { requireUser, setSession } from '../context.js';
import { sendError, validation } from '../errors.js';
import { config } from '../env.js';
import { bootstrapWorkspaceDefaults } from '../lib/bootstrapWorkspace.js';
import { enqueueMail, roleLabel } from '../lib/enqueueMail.js';
import { internalDomains, roleForInvite } from '../lib/inviteRole.js';
import { newInviteToken, projectKeyFromName, slugify } from '../lib/tokens.js';

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(40).optional(),
  workflow: z.enum(['delivery', 'simple']).default('delivery'),
  allowedDomain: z.string().trim().optional(),
  inviteEmails: z.array(z.string().email()).optional(),
  firstProjectName: z.string().trim().max(80).optional(),
});

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.post('/workspaces', async (req, reply) => {
    try {
      const user = await requireUser(req);
      const input = createSchema.parse(req.body);
      let slug = slugify(input.slug ?? input.name);
      const clash = await prisma.workspace.findUnique({ where: { slug } });
      if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

      const workspace = await prisma.workspace.create({
        data: {
          name: input.name,
          slug,
          allowedDomains: input.allowedDomain ? [input.allowedDomain.toLowerCase()] : undefined,
        },
      });

      await prisma.tenantMember.create({
        data: { tenantId: workspace.id, userId: user.id, tenantRole: 'owner' },
      });

      const db = createTenantClient(workspace.id);
      const defaults = await bootstrapWorkspaceDefaults(db, workspace.id);
      const workflow = await db.workflow.findFirstOrThrow({
        where: { slug: input.workflow === 'simple' ? 'simple' : 'delivery' },
      });
      await db.workspace.update({
        where: { id: workspace.id },
        data: { defaultWorkflowId: workflow.id },
      });

      if (input.firstProjectName) {
        const key = projectKeyFromName(input.firstProjectName);
        const project = await db.project.create({
          data: {
            tenantId: workspace.id,
            name: input.firstProjectName,
            key,
            colour: '#178A5C',
            leadId: user.id,
            workflowId: workflow.id,
          },
        });
        await db.section.create({ data: { tenantId: workspace.id, projectId: project.id, name: 'Inbox', position: 'a0' } });
        const member = await db.projectMember.create({ data: { tenantId: workspace.id, projectId: project.id, userId: user.id } });
        if (defaults.roleIds.lead) {
          await db.projectMemberRole.create({
            data: { tenantId: workspace.id, memberId: member.id, roleId: defaults.roleIds.lead },
          });
        }
      }

      const domains = internalDomains(input.allowedDomain ? [input.allowedDomain] : [], user.email);
      for (const emailRaw of input.inviteEmails ?? []) {
        const email = emailRaw.toLowerCase();
        if (email === user.email.toLowerCase()) continue;
        const tenantRole = roleForInvite(email, 'member', domains);
        const { token, hash } = newInviteToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.invitation.create({
          data: {
            tenantId: workspace.id,
            email,
            tenantRole,
            tokenHash: hash,
            invitedById: user.id,
            expiresAt,
          },
        });
        const url = `${config.publicUrl.replace(/\/$/, '')}/invite/${token}`;
        await enqueueMail({
          kind: 'invite',
          to: email,
          inviteUrl: url,
          workspaceName: workspace.name,
          inviterName: user.name,
          roleLabel: roleLabel(tenantRole),
          message: null,
          expiresAt: expiresAt.toISOString(),
        });
      }

      setSession(req, reply, { userId: user.id, tenantId: workspace.id });
      return { id: workspace.id, name: workspace.name, slug: workspace.slug };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/workspaces/slug-available', async (req, reply) => {
    try {
      const slug = slugify(String((req.query as { slug?: string }).slug ?? ''));
      if (slug.length < 2) throw validation('Choose a longer web address.');
      const existing = await prisma.workspace.findUnique({ where: { slug } });
      return { slug, available: !existing };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
