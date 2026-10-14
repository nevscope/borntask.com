import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../context.js';
import { forbidden, notFound, sendError } from '../errors.js';
import { mapUser } from '../lib/loadProject.js';
import { loadWorkflow } from '../lib/loadProject.js';

function requireOwnerAdmin(role: string) {
  if (role !== 'owner' && role !== 'admin') throw forbidden('Owners and admins only.');
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workspace', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      if (!ws) throw notFound();
      const workflows = await auth.db.workflow.findMany({ orderBy: { name: 'asc' } });
      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        timeZone: ws.timeZone,
        weekStart: ws.weekStart,
        defaultWorkflowId: ws.defaultWorkflowId,
        bugsStartIn: ws.bugsStartIn,
        allowGoogle: ws.allowGoogle,
        allowMicrosoft: ws.allowMicrosoft,
        membersCanInviteGuests: ws.membersCanInviteGuests,
        allowedDomains: ws.allowedDomains,
        isInternal: ws.isInternal,
        workflows: workflows.map((w) => ({ id: w.id, name: w.name, slug: w.slug })),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/workspace', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const body = z
        .object({
          name: z.string().trim().min(2).max(80).optional(),
          slug: z.string().trim().min(2).max(40).optional(),
          timeZone: z.string().min(1).optional(),
          weekStart: z.enum(['monday', 'sunday']).optional(),
          defaultWorkflowId: z.string().optional(),
          bugsStartIn: z.enum(['approved', 'idea']).optional(),
          allowGoogle: z.boolean().optional(),
          allowMicrosoft: z.boolean().optional(),
          membersCanInviteGuests: z.boolean().optional(),
        })
        .parse(req.body);
      if (body.slug) {
        const clash = await prisma.workspace.findFirst({ where: { slug: body.slug, NOT: { id: auth.tenantId } } });
        if (clash) throw forbidden('That web address is already taken.');
      }
      const ws = await auth.db.workspace.update({ where: { id: auth.tenantId }, data: body });
      return { ok: true, name: ws.name, slug: ws.slug };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/admin/defaults', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const [roles, types, workflows] = await Promise.all([
        auth.db.projectRole.findMany({ orderBy: { name: 'asc' } }),
        auth.db.taskType.findMany({ orderBy: { name: 'asc' } }),
        auth.db.workflow.findMany({ orderBy: { name: 'asc' } }),
      ]);
      const detailed = await Promise.all(workflows.map((w) => loadWorkflow(auth.db, w.id)));
      return {
        roles: roles.map((r) => ({ id: r.id, name: r.name, slug: r.slug, colour: r.colour })),
        types: types.map((t) => ({ id: t.id, name: t.name, slug: t.slug, colour: t.colour, template: t.template })),
        workflows: detailed,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/people/:userId', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const userId = (req.params as { userId: string }).userId;
      const body = z.object({ tenantRole: z.enum(['admin', 'member', 'guest', 'viewer']) }).parse(req.body);
      const member = await auth.db.tenantMember.findFirst({ where: { userId } });
      if (!member) throw notFound();
      if (member.tenantRole === 'owner') throw forbidden('The owner role cannot be changed here.');
      await auth.db.tenantMember.update({ where: { id: member.id }, data: { tenantRole: body.tenantRole } });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/invites', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const q = req.query as { projectId?: string };
      const invites = await auth.db.invitation.findMany({
        where: {
          acceptedAt: null,
          revokedAt: null,
          ...(q.projectId ? { projectId: q.projectId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        invites: invites.map((i) => ({
          id: i.id,
          email: i.email,
          tenantRole: i.tenantRole,
          projectId: i.projectId,
          expiresAt: i.expiresAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
        })),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
