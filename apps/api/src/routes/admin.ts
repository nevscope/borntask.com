import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z, ZodError } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, setSession, type Authed } from '../context.js';
import { config } from '../env.js';
import { forbidden, notFound, sendError, validation } from '../errors.js';
import { colourSchema, deleteRole, deleteType, deleteWorkflow, patchRole, patchType, uniqueSlug } from '../lib/adminCatalog.js';
import { createOpenWorkflow } from '../lib/bootstrapWorkspace.js';
import { loadWorkflow } from '../lib/loadProject.js';

function requireOwnerAdmin(role: string) {
  if (role !== 'owner' && role !== 'admin') throw forbidden('Owners and admins only.');
}

async function workspaceSettings(auth: Authed) {
  const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
  if (!ws) throw notFound();
  const [workflows, roles, types] = await Promise.all([
    auth.db.workflow.findMany({ orderBy: { name: 'asc' } }),
    auth.db.projectRole.findMany({ orderBy: { name: 'asc' } }),
    auth.db.taskType.findMany({ orderBy: { name: 'asc' } }),
  ]);
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
    logo: Boolean(ws.logo),
    workflows: workflows.map((w) => ({ id: w.id, name: w.name, slug: w.slug })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, slug: r.slug, colour: r.colour })),
    types: types.map((t) => ({ id: t.id, name: t.name, slug: t.slug, colour: t.colour, template: t.template })),
  };
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workspace', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      return await workspaceSettings(auth);
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
          defaultWorkflowId: z.string().min(1).nullable().optional(),
          bugsStartIn: z.enum(['approved', 'idea']).optional(),
          allowGoogle: z.boolean().optional(),
          allowMicrosoft: z.boolean().optional(),
          membersCanInviteGuests: z.boolean().optional(),
          allowedDomains: z.array(z.string().trim().min(1)).optional(),
        })
        .parse(req.body);
      if (body.slug) {
        const clash = await prisma.workspace.findFirst({ where: { slug: body.slug, NOT: { id: auth.tenantId } } });
        if (clash) throw forbidden('That web address is already taken.');
      }
      await auth.db.workspace.update({ where: { id: auth.tenantId }, data: body });
      return await workspaceSettings(auth);
    } catch (err) {
      if (err instanceof ZodError) return sendError(reply, validation('Check the workspace fields and try again.'));
      return sendError(reply, err);
    }
  });

  app.get('/admin/defaults', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const [roles, types, workflows, counts, grants, ws] = await Promise.all([
        auth.db.projectRole.findMany({ orderBy: { name: 'asc' } }),
        auth.db.taskType.findMany({ orderBy: { name: 'asc' } }),
        auth.db.workflow.findMany({ orderBy: { name: 'asc' } }),
        auth.db.project.groupBy({ by: ['workflowId'], _count: { _all: true } }),
        auth.db.projectMemberRole.findMany({ select: { roleId: true, member: { select: { userId: true } } } }),
        auth.db.workspace.findUnique({ where: { id: auth.tenantId }, select: { defaultWorkflowId: true } }),
      ]);
      const used = new Map(counts.map((row) => [row.workflowId, row._count._all]));
      const peopleByRole = new Map<string, Set<string>>();
      for (const grant of grants) {
        const set = peopleByRole.get(grant.roleId) ?? new Set<string>();
        set.add(grant.member.userId);
        peopleByRole.set(grant.roleId, set);
      }
      const detailed = await Promise.all(workflows.map(async (w) => ({
        ...(await loadWorkflow(auth.db, w.id)),
        projectCount: used.get(w.id) ?? 0,
      })));
      return {
        defaultWorkflowId: ws?.defaultWorkflowId ?? null,
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          colour: r.colour,
          people: peopleByRole.get(r.id)?.size ?? 0,
        })),
        types: types.map((t) => ({ id: t.id, name: t.name, slug: t.slug, colour: t.colour, template: t.template })),
        workflows: detailed,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/admin/roles', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const body = z.object({
        name: z.string().trim().min(2).max(40),
        colour: colourSchema.optional(),
      }).parse(req.body);
      const taken = new Set((await auth.db.projectRole.findMany({ select: { slug: true } })).map((r) => r.slug));
      const slug = uniqueSlug(body.name, taken);
      const row = await auth.db.projectRole.create({
        data: { tenantId: auth.tenantId, name: body.name, slug, colour: body.colour ?? '#5B6157' },
      });
      return { id: row.id, name: row.name, slug: row.slug, colour: row.colour };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/admin/types', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const body = z.object({
        name: z.string().trim().min(2).max(40),
        colour: colourSchema.optional(),
        template: z.string().max(4000).optional(),
      }).parse(req.body);
      const taken = new Set((await auth.db.taskType.findMany({ select: { slug: true } })).map((t) => t.slug));
      const slug = uniqueSlug(body.name, taken);
      const row = await auth.db.taskType.create({
        data: {
          tenantId: auth.tenantId,
          name: body.name,
          slug,
          colour: body.colour ?? '#178A5C',
          template: body.template?.trim() || null,
        },
      });
      return { id: row.id, name: row.name, slug: row.slug, colour: row.colour };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/admin/workflows', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const body = z.object({ name: z.string().trim().min(2).max(60).default('New workflow') }).parse(req.body ?? {});
      const wf = await createOpenWorkflow(auth.db, auth.tenantId, body.name);
      return { id: wf.id, name: wf.name, slug: wf.slug };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/admin/roles/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const body = z.object({
        name: z.string().trim().min(2).max(40).optional(),
        colour: colourSchema.optional(),
      }).parse(req.body);
      const row = await patchRole(auth, id, body);
      return { id: row.id, name: row.name, slug: row.slug, colour: row.colour };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/admin/roles/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      return await deleteRole(auth, (req.params as { id: string }).id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/admin/types/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const body = z.object({
        name: z.string().trim().min(2).max(40).optional(),
        colour: colourSchema.optional(),
        template: z.string().max(4000).nullable().optional(),
      }).parse(req.body);
      const row = await patchType(auth, id, body);
      return { id: row.id, name: row.name, slug: row.slug, colour: row.colour, template: row.template };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/admin/types/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      return await deleteType(auth, (req.params as { id: string }).id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/admin/workflows/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      return await deleteWorkflow(auth, (req.params as { id: string }).id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/workspace/logo', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const file = await req.file();
      if (!file) throw validation('Choose an image to upload.');
      const ext = (file.filename.split('.').pop() ?? '').toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        throw validation('Use a PNG, JPG, WEBP or GIF image.');
      }
      const buf = await file.toBuffer();
      if (buf.length > 2 * 1024 * 1024) throw validation('Logo images must be 2 MB or smaller.');
      const storageKey = `${auth.tenantId}/logo.${ext === 'jpeg' ? 'jpg' : ext}`;
      await mkdir(join(config.blobRoot, auth.tenantId), { recursive: true });
      await writeFile(join(config.blobRoot, storageKey), buf);
      await auth.db.workspace.update({ where: { id: auth.tenantId }, data: { logo: storageKey } });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/workspace/logo', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      if (!ws?.logo) throw notFound();
      const buf = await readFile(join(config.blobRoot, ws.logo));
      const ext = ws.logo.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      return reply.header('Cache-Control', 'no-store').type(mime).send(buf);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/workspace/delete', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.workspaceRole !== 'owner') throw forbidden('Only the owner can delete a workspace.');
      const body = z.object({ name: z.string() }).parse(req.body);
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      if (!ws) throw notFound();
      if (body.name !== ws.name) throw validation('Type the workspace name to confirm.');
      await prisma.workspace.update({ where: { id: ws.id }, data: { deletedAt: new Date() } });
      const others = await prisma.tenantMember.findMany({
        where: { userId: auth.userId, isActive: true, tenantId: { not: ws.id }, tenant: { deletedAt: null } },
        orderBy: { createdAt: 'asc' },
      });
      const next = others[0]?.tenantId;
      setSession(req, reply, { userId: auth.userId, tenantId: next });
      return { ok: true, next: next ? '/' : '/create-workspace' };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/people/:userId', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const userId = (req.params as { userId: string }).userId;
      const body = z.object({ tenantRole: z.enum(['owner', 'admin', 'member', 'guest', 'viewer']) }).parse(req.body);
      const member = await auth.db.tenantMember.findFirst({ where: { userId } });
      if (!member) throw notFound();
      if (body.tenantRole === 'owner') {
        if (auth.workspaceRole !== 'owner') throw forbidden('Only the owner can transfer ownership.');
        if (userId === auth.userId) throw validation('You already own this workspace.');
        if (member.tenantRole === 'guest') throw validation('Make this person a member before making them owner.');
        const currentOwner = await auth.db.tenantMember.findFirst({ where: { userId: auth.userId } });
        if (!currentOwner) throw notFound();
        await auth.db.$transaction([
          auth.db.tenantMember.update({ where: { id: currentOwner.id }, data: { tenantRole: 'admin' } }),
          auth.db.tenantMember.update({ where: { id: member.id }, data: { tenantRole: 'owner' } }),
        ]);
        return { ok: true };
      }
      if (member.tenantRole === 'owner') throw forbidden('The owner role cannot be changed here. Transfer ownership to someone else first.');
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
