import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, type Authed } from '../context.js';
import { forbidden, notFound, sendError, validation } from '../errors.js';
import { loadProjectDetail, mapProjectCards, mapUser } from '../lib/loadProject.js';
import { projectKeyFromName } from '../lib/tokens.js';

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().min(2).max(6).optional(),
  colour: z.string().regex(/^#?[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/, 'Colour must be a hex value such as #178A5C').optional(),
  workflowId: z.string().optional(),
  workflow: z.enum(['delivery', 'simple']).optional(),
  sections: z.array(z.string().trim().min(1)).optional(),
  memberIds: z.array(z.string()).optional(),
  members: z.array(z.object({
    userId: z.string(),
    roleSlugs: z.array(z.string()).default([]),
  })).optional(),
});

async function visibleProject(auth: Authed, key: string) {
  const project = await auth.db.project.findFirst({ where: { key } });
  if (!project) throw notFound('Project not found.');
  if (auth.workspaceRole === 'guest') {
    const on = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId: auth.userId } });
    if (!on) throw forbidden("You're not on this project.");
  }
  return project;
}

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const membership = await auth.db.tenantMember.findFirst({
        where: { userId: auth.userId },
      });
      const archived = String((req.query as { archived?: string }).archived ?? '') === 'true';
      const guest = membership?.tenantRole === 'guest';
      const mine = guest
        ? await auth.db.projectMember.findMany({ where: { userId: auth.userId }, select: { projectId: true } })
        : null;
      const projects = await auth.db.project.findMany({
        where: {
          archivedAt: archived ? { not: null } : null,
          ...(mine ? { id: { in: mine.map((m) => m.projectId) } } : {}),
        },
        orderBy: { name: 'asc' },
      });
      return mapProjectCards(auth.db, auth.userId, projects);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/projects/:key', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const detail = await loadProjectDetail(auth.db, key, auth.userId);
      if (!detail) throw notFound('Project not found.');
      if (auth.workspaceRole === 'guest') {
        const on = detail.members.some((m) => m.userId === auth.userId);
        if (!on) throw forbidden("You're not on this project.");
      }
      return detail;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.workspaceRole === 'guest' || auth.workspaceRole === 'viewer') {
        throw forbidden('Guests and viewers cannot create projects.');
      }
      const input = createProjectSchema.parse(req.body);
      const key = (input.key ?? projectKeyFromName(input.name)).toUpperCase();
      const clash = await auth.db.project.findFirst({ where: { key } });
      if (clash) throw validation(`Project key ${key} is already used.`);
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      let workflowId = input.workflowId ?? ws?.defaultWorkflowId;
      if (input.workflow) {
        const named = await auth.db.workflow.findFirst({ where: { slug: input.workflow } });
        if (named) workflowId = named.id;
      }
      if (!workflowId) throw validation('No workflow available.');
      const project = await auth.db.project.create({
        data: {
          tenantId: auth.tenantId,
          name: input.name,
          key,
          colour: input.colour
            ? `#${input.colour.replace(/^#/, '').toUpperCase().replace(/^([0-9A-F])([0-9A-F])([0-9A-F])$/, (_, a, b, c) => `${a}${a}${b}${b}${c}${c}`)}`
            : '#178A5C',
          leadId: auth.userId,
          workflowId,
        },
      });
      const names = input.sections?.length ? input.sections : ['Inbox'];
      for (let i = 0; i < names.length; i++) {
        await auth.db.section.create({
          data: { tenantId: auth.tenantId, projectId: project.id, name: names[i]!, position: `a${i}` },
        });
      }
      const member = await auth.db.projectMember.create({
        data: { tenantId: auth.tenantId, projectId: project.id, userId: auth.userId },
      });
      const lead = await auth.db.projectRole.findFirst({ where: { slug: 'lead' } });
      if (lead) {
        await auth.db.projectMemberRole.create({ data: { tenantId: auth.tenantId, memberId: member.id, roleId: lead.id } });
      }
      const extras = [
        ...(input.memberIds ?? []).map((userId) => ({ userId, roleSlugs: [] as string[] })),
        ...(input.members ?? []),
      ];
      for (const extra of extras) {
        if (extra.userId === auth.userId) continue;
        const row = await auth.db.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: extra.userId } },
          update: {},
          create: { tenantId: auth.tenantId, projectId: project.id, userId: extra.userId },
        });
        if (extra.roleSlugs.length) {
          const roles = await auth.db.projectRole.findMany({ where: { slug: { in: extra.roleSlugs } } });
          for (const role of roles) {
            await auth.db.projectMemberRole.upsert({
              where: { memberId_roleId: { memberId: row.id, roleId: role.id } },
              update: {},
              create: { tenantId: auth.tenantId, memberId: row.id, roleId: role.id },
            });
          }
        }
      }
      const detail = await loadProjectDetail(auth.db, key, auth.userId);
      return detail;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/sections', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      const count = await auth.db.section.count({ where: { projectId: project.id } });
      const section = await auth.db.section.create({
        data: { tenantId: auth.tenantId, projectId: project.id, name: body.name, position: `a${count}` },
      });
      return { id: section.id, projectKey: key, name: section.name, position: count };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/projects/:key/sections/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { id } = req.params as { id: string };
      const body = z.object({
        name: z.string().trim().min(1).max(80).optional(),
        position: z.string().optional(),
      }).parse(req.body);
      const section = await auth.db.section.update({
        where: { id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.position ? { position: body.position } : {}),
        },
      });
      return { id: section.id, name: section.name };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/members', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ userId: z.string(), roleSlugs: z.array(z.string()).default([]) }).parse(req.body);
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      const member = await auth.db.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: body.userId } },
        update: {},
        create: { tenantId: auth.tenantId, projectId: project.id, userId: body.userId },
      });
      const roles = await auth.db.projectRole.findMany({ where: { slug: { in: body.roleSlugs } } });
      for (const role of roles) {
        await auth.db.projectMemberRole.upsert({
          where: { memberId_roleId: { memberId: member.id, roleId: role.id } },
          update: {},
          create: { tenantId: auth.tenantId, memberId: member.id, roleId: role.id },
        });
      }
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/projects/:key/members/:userId', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, userId } = req.params as { key: string; userId: string };
      const body = z.object({ roleSlugs: z.array(z.string()) }).parse(req.body);
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      const member = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId } });
      if (!member) throw notFound();
      await auth.db.projectMemberRole.deleteMany({ where: { memberId: member.id } });
      const roles = await auth.db.projectRole.findMany({ where: { slug: { in: body.roleSlugs } } });
      for (const role of roles) {
        await auth.db.projectMemberRole.create({
          data: { tenantId: auth.tenantId, memberId: member.id, roleId: role.id },
        });
      }
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/projects/:key/members/:userId', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, userId } = req.params as { key: string; userId: string };
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      const member = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId } });
      if (!member) throw notFound();
      await auth.db.projectMemberRole.deleteMany({ where: { memberId: member.id } });
      await auth.db.projectMember.delete({ where: { id: member.id } });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/favourite', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await visibleProject(auth, key);
      await auth.db.favourite.upsert({
        where: { userId_projectId: { userId: auth.userId, projectId: project.id } },
        update: {},
        create: { tenantId: auth.tenantId, userId: auth.userId, projectId: project.id },
      });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/projects/:key/favourite', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await visibleProject(auth, key);
      await auth.db.favourite.deleteMany({ where: { userId: auth.userId, projectId: project.id } });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/archive', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ archived: z.boolean() }).parse(req.body);
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      await auth.db.project.update({
        where: { id: project.id },
        data: { archivedAt: body.archived ? new Date() : null },
      });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/projects/:key/sections/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const body = z.object({ moveToSectionId: z.string() }).parse(req.body);
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound();
      await auth.db.task.updateMany({ where: { sectionId: id }, data: { sectionId: body.moveToSectionId } });
      await auth.db.section.delete({ where: { id } });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/access-requests', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound('This project is not in your workspace.');
      const existing = await auth.db.accessRequest.findFirst({
        where: { projectId: project.id, requesterId: auth.userId, resolvedAt: null },
      });
      if (!existing) {
        await auth.db.accessRequest.create({
          data: { tenantId: auth.tenantId, projectId: project.id, requesterId: auth.userId },
        });
      }
      const lead = project.leadId
        ? await prisma.user.findUnique({ where: { id: project.leadId }, select: { name: true } })
        : null;
      return { ok: true, leadName: lead?.name ?? null };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/people', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.workspaceRole === 'guest') throw forbidden();
      const members = await auth.db.tenantMember.findMany({ where: { isActive: true } });
      const users = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) } } });
      const onProjects = await auth.db.projectMember.findMany({
        where: { userId: { in: members.map((m) => m.userId) } },
        include: { project: { select: { name: true } } },
      });
      const projectsByUser = new Map<string, string[]>();
      for (const row of onProjects) {
        const list = projectsByUser.get(row.userId) ?? [];
        list.push(row.project.name);
        projectsByUser.set(row.userId, list);
      }
      return members.map((m) => {
        const u = users.find((x) => x.id === m.userId);
        return {
          ...mapUser(u ?? { id: m.userId, name: 'Unknown', email: '' }),
          workspaceRole: m.tenantRole,
          signsInWith: u?.authProvider === 'microsoft' ? 'Microsoft' : u?.authProvider === 'google' ? 'Google' : '-',
          projects: (projectsByUser.get(m.userId) ?? []).join(', ') || 'None',
        };
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
