import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, type Authed } from '../context.js';
import { forbidden, notFound, sendError, validation } from '../errors.js';
import { loadProjectDetail, mapProjectCards, mapUser } from '../lib/loadProject.js';
import { rankKey } from '../lib/mappers.js';
import { switchProjectWorkflow } from '../lib/switchProjectWorkflow.js';
import { deleteProject } from '../lib/deleteProject.js';
import { projectKeyFromName } from '../lib/tokens.js';
import { acceptProjectInvite } from '../lib/applyProjectInvite.js';
import { normaliseProjectKey, workBreakdownSchema } from '@borntask/shared';
import { ensurePlanningTypes } from '../lib/planning.js';
import { inAppAllowed } from '../lib/notifyInApp.js';
import { assertCanManageOpenProject, canDiscoverWorkspaceProjects, canOpenListed, findPendingProjectInvite, openProjectIds, pendingInviteProjectIds, requireOpenProject, requireOpenProjectWrite } from '../lib/projectAccess.js';

const colourSchema = z.string().regex(/^#?[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/, 'Colour must be a hex value such as #178A5C');

function normaliseColour(value: string): string {
  const hex = value.trim().replace(/^#/, '').toUpperCase();
  const full = hex.length === 3 ? hex.replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3') : hex;
  return `#${full}`;
}

async function notifyAccessRequest(auth: Authed, project: { id: string; key: string; leadId: string | null }) {
  const recipients = new Set<string>();
  if (project.leadId) recipients.add(project.leadId);
  const leads = await auth.db.projectMemberRole.findMany({
    where: { member: { projectId: project.id }, role: { slug: 'lead' } },
    select: { member: { select: { userId: true } } },
  });
  for (const row of leads) recipients.add(row.member.userId);
  const admins = await prisma.tenantMember.findMany({
    where: { tenantId: auth.tenantId, tenantRole: { in: ['owner', 'admin'] } },
    select: { userId: true },
  });
  for (const row of admins) recipients.add(row.userId);
  recipients.delete(auth.userId);
  for (const userId of recipients) {
    if (!(await inAppAllowed(auth, userId, 'access_request'))) continue;
    await auth.db.notification.create({
      data: { tenantId: auth.tenantId, userId, actorId: auth.userId, kind: `access_request:${project.key}` },
    });
  }
}

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().min(3).max(3).optional(),
  colour: colourSchema.optional(),
  workflowId: z.string().optional(),
  workflow: z.enum(['delivery', 'simple']).optional(),
  sections: z.array(z.string().trim().min(1)).optional(),
  memberIds: z.array(z.string()).optional(),
  members: z.array(z.object({
    userId: z.string(),
    roleSlugs: z.array(z.string()).default([]),
  })).optional(),
  workBreakdown: workBreakdownSchema.optional(),
  storiesNeedApproval: z.boolean().optional(),
});

async function visibleProject(auth: Authed, key: string) {
  return requireOpenProject(auth, key);
}

async function assertCanEditProject(auth: Authed, project: { id: string; leadId: string | null }) {
  if (auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin' || project.leadId === auth.userId) return;
  const member = await auth.db.projectMember.findFirst({
    where: { projectId: project.id, userId: auth.userId },
    include: { roles: { include: { role: true } } },
  });
  if (member?.roles.some((role) => role.role.slug === 'lead')) return;
  throw forbidden('Only a project lead or workspace admin can change this project.');
}

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const archived = String((req.query as { archived?: string }).archived ?? '') === 'true';
      const openIds = await openProjectIds(auth);
      const discover = canDiscoverWorkspaceProjects(auth.workspaceRole);
      const inviteIds = await pendingInviteProjectIds(auth);
      const allowedIds = openIds ? [...openIds, ...inviteIds] : null;
      const projects = await auth.db.project.findMany({
        where: {
          archivedAt: archived ? { not: null } : null,
          ...(!discover && allowedIds ? { id: { in: allowedIds } } : {}),
        },
        orderBy: { name: 'asc' },
      });
      const pending = await auth.db.accessRequest.findMany({
        where: { requesterId: auth.userId, resolvedAt: null, projectId: { in: projects.map((p) => p.id) } },
        select: { projectId: true },
      });
      const requested = new Set(pending.map((r) => r.projectId));
      const invited = new Set(inviteIds);
      const cards = await mapProjectCards(auth.db, auth.userId, projects);
      return cards.map((card) => ({
        ...card,
        canOpen: canOpenListed(openIds, card.id) || invited.has(card.id),
        pendingInvite: invited.has(card.id),
        accessRequested: requested.has(card.id),
      }));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/projects/:key', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await requireOpenProject(auth, key);
      const detail = await loadProjectDetail(auth.db, key, auth.userId);
      if (!detail) throw notFound('Project not found.');
      const pendingInvite = Boolean(await findPendingProjectInvite(auth, project.id))
        && !(await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId: auth.userId } }));
      return { ...detail, project: { ...detail.project, pendingInvite } };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/accept-invite', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = normaliseProjectKey((req.params as { key: string }).key);
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound('Project not found.');
      const invite = await findPendingProjectInvite(auth, project.id);
      if (!invite) throw validation('There is no invitation for you on this project.');
      await acceptProjectInvite(auth.db, { tenantId: auth.tenantId, userId: auth.userId, invite });
      const detail = await loadProjectDetail(auth.db, key, auth.userId);
      if (!detail) throw notFound('Project not found.');
      return { ...detail, project: { ...detail.project, pendingInvite: false } };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/projects/:key', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const parsed = z.object({
        name: z.string().trim().min(2).max(80).optional(),
        colour: colourSchema.optional(),
        workflowId: z.string().min(1).optional(),
        disabledTypes: z.array(z.string().trim().min(1)).optional(),
        workBreakdown: workBreakdownSchema.optional(),
        storiesNeedApproval: z.boolean().optional(),
      }).refine((value) => value.name !== undefined || value.colour !== undefined || value.workflowId !== undefined || value.disabledTypes !== undefined || value.workBreakdown !== undefined || value.storiesNeedApproval !== undefined, {
        message: 'Send a name, a colour, a workflow, types or work breakdown to update.',
      }).safeParse(req.body);
      if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? 'Check the name, colour and workflow.');
      const project = await visibleProject(auth, key);
      await assertCanEditProject(auth, project);
      let workflowId = project.workflowId;
      if (parsed.data.workflowId && parsed.data.workflowId !== project.workflowId) {
        const switched = await switchProjectWorkflow(auth, project.id, parsed.data.workflowId);
        workflowId = switched.workflowId;
      }
      if (parsed.data.disabledTypes !== undefined) {
        const types = await auth.db.taskType.findMany({ select: { slug: true } });
        const known = new Set(types.map((row) => row.slug));
        const disabled = [...new Set(parsed.data.disabledTypes.filter((slug) => known.has(slug)))];
        if (disabled.length >= types.length) throw validation('Keep at least one task type on this project.');
        for (const slug of disabled) {
          const used = await auth.db.task.count({
            where: { projectId: project.id, deletedAt: null, type: { slug } },
          });
          if (used > 0) throw validation(`Cannot switch off ${slug}: ${used} open task${used === 1 ? '' : 's'} still use it.`);
        }
      }
      if (parsed.data.workBreakdown && parsed.data.workBreakdown !== 'off') {
        await ensurePlanningTypes(auth.db, auth.tenantId);
      }
      const data = {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.colour !== undefined ? { colour: normaliseColour(parsed.data.colour) } : {}),
        ...(parsed.data.disabledTypes !== undefined ? { disabledTypes: parsed.data.disabledTypes.join(',') } : {}),
        ...(parsed.data.workBreakdown !== undefined ? { workBreakdown: parsed.data.workBreakdown } : {}),
        ...(parsed.data.storiesNeedApproval !== undefined ? { storiesNeedApproval: parsed.data.storiesNeedApproval } : {}),
      };
      const updated = Object.keys(data).length
        ? await auth.db.project.update({ where: { id: project.id }, data })
        : project;
      return {
        name: updated.name,
        colour: updated.colour,
        workflowId,
        disabledTypes: updated.disabledTypes.split(',').map((slug) => slug.trim()).filter(Boolean),
        workBreakdown: updated.workBreakdown,
        storiesNeedApproval: updated.storiesNeedApproval,
      };
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
      const existing = await auth.db.project.findMany({ select: { key: true } });
      const taken = existing.map((row) => row.key);
      const requested = input.key ? normaliseProjectKey(input.key) : '';
      if (input.key && requested.length !== 3) {
        throw validation('The key must be exactly 3 letters.');
      }
      const key = requested.length === 3 && !taken.includes(requested)
        ? requested
        : projectKeyFromName(input.name, taken);
      if (requested.length === 3 && taken.includes(requested) && requested !== key) {
        throw validation(`Project key ${requested} is already used. Try ${key}.`);
      }
      const clash = await auth.db.project.findFirst({ where: { key } });
      if (clash) throw validation(`Project key ${key} is already used.`);
      const ws = await auth.db.workspace.findUnique({ where: { id: auth.tenantId } });
      let workflowId = input.workflowId ?? ws?.defaultWorkflowId;
      if (input.workflow) {
        const named = await auth.db.workflow.findFirst({ where: { slug: input.workflow } });
        if (named) workflowId = named.id;
      }
      if (!workflowId) throw validation('No workflow available.');
      if (input.workBreakdown && input.workBreakdown !== 'off') {
        await ensurePlanningTypes(auth.db, auth.tenantId);
      }
      const project = await auth.db.project.create({
        data: {
          tenantId: auth.tenantId,
          name: input.name,
          key,
          colour: input.colour ? normaliseColour(input.colour) : '#178A5C',
          leadId: auth.userId,
          workflowId,
          workBreakdown: input.workBreakdown ?? 'off',
          storiesNeedApproval: input.storiesNeedApproval ?? true,
        },
      });
      const names = input.sections?.length ? input.sections : ['Inbox'];
      for (let i = 0; i < names.length; i++) {
        await auth.db.section.create({
          data: { tenantId: auth.tenantId, projectId: project.id, name: names[i]!, position: rankKey(i) },
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
      const project = await requireOpenProjectWrite(auth, key);
      const count = await auth.db.section.count({ where: { projectId: project.id } });
      const section = await auth.db.section.create({
        data: { tenantId: auth.tenantId, projectId: project.id, name: body.name, position: rankKey(count) },
      });
      return { id: section.id, projectKey: key, name: section.name, position: count };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/projects/:key/sections/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const body = z.object({
        name: z.string().trim().min(1).max(80).optional(),
        position: z.string().optional(),
      }).parse(req.body);
      await requireOpenProjectWrite(auth, key);
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

  app.post('/projects/:key/sections/reorder', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
      const project = await requireOpenProjectWrite(auth, key);
      const existing = await auth.db.section.findMany({ where: { projectId: project.id } });
      const known = new Set(existing.map((s) => s.id));
      if (body.ids.length !== existing.length || body.ids.some((id) => !known.has(id))) {
        throw validation('Section list is out of date. Refresh and try again.');
      }
      await auth.db.$transaction(
        body.ids.map((id, index) => auth.db.section.update({ where: { id }, data: { position: rankKey(index) } })),
      );
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/members', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ userId: z.string(), roleSlugs: z.array(z.string()).default([]) }).parse(req.body);
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can change members.');
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
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can change members.');
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
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can change members.');
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
      const project = await visibleProject(auth, key);
      await assertCanEditProject(auth, project);
      await auth.db.project.update({
        where: { id: project.id },
        data: { archivedAt: body.archived ? new Date() : null },
      });
      return { ok: true, archived: body.archived };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/delete', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({ name: z.string() }).parse(req.body);
      const project = await visibleProject(auth, key);
      await assertCanEditProject(auth, project);
      await deleteProject(auth, project, body.name);
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
      await requireOpenProjectWrite(auth, key);
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
      const key = normaliseProjectKey((req.params as { key: string }).key);
      const project = await auth.db.project.findFirst({ where: { key } });
      if (!project) throw notFound('This project is not in your workspace.');
      const alreadyMember = await auth.db.projectMember.findFirst({
        where: { projectId: project.id, userId: auth.userId },
      });
      const alreadyOn = Boolean(alreadyMember) || project.leadId === auth.userId || auth.workspaceRole === 'owner';
      const existing = !alreadyOn
        ? await auth.db.accessRequest.findFirst({
            where: { projectId: project.id, requesterId: auth.userId, resolvedAt: null },
          })
        : null;
      if (!alreadyOn && !existing) {
        await auth.db.accessRequest.create({
          data: { tenantId: auth.tenantId, projectId: project.id, requesterId: auth.userId },
        });
        await notifyAccessRequest(auth, project);
      }
      const lead = project.leadId
        ? await prisma.user.findUnique({ where: { id: project.leadId }, select: { name: true } })
        : null;
      return { ok: true, leadName: lead?.name ?? null };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/projects/:key/access-requests', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await requireOpenProject(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can review access requests.');
      const rows = await auth.db.accessRequest.findMany({
        where: { projectId: project.id, resolvedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      const people = rows.length
        ? await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.requesterId) } } })
        : [];
      const byId = new Map(people.map((p) => [p.id, p]));
      return rows.map((row) => {
        const person = byId.get(row.requesterId);
        return {
          id: row.id,
          requesterId: row.requesterId,
          name: person?.name ?? 'Unknown',
          email: person?.email ?? '',
          createdAt: row.createdAt.toISOString(),
        };
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/access-requests/:id/accept', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can review access requests.');
      const row = await auth.db.accessRequest.findFirst({
        where: { id, projectId: project.id, resolvedAt: null },
      });
      if (!row) throw notFound('That request is no longer pending.');
      await auth.db.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: row.requesterId } },
        update: {},
        create: { tenantId: auth.tenantId, projectId: project.id, userId: row.requesterId },
      });
      await auth.db.accessRequest.update({ where: { id: row.id }, data: { resolvedAt: new Date() } });
      await auth.db.notification.create({
        data: { tenantId: auth.tenantId, userId: row.requesterId, actorId: auth.userId, kind: 'access_granted' },
      });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/access-requests/:id/decline', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const { key, id } = req.params as { key: string; id: string };
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can review access requests.');
      const row = await auth.db.accessRequest.findFirst({
        where: { id, projectId: project.id, resolvedAt: null },
      });
      if (!row) throw notFound('That request is no longer pending.');
      await auth.db.accessRequest.update({ where: { id: row.id }, data: { resolvedAt: new Date() } });
      await auth.db.notification.create({
        data: { tenantId: auth.tenantId, userId: row.requesterId, actorId: auth.userId, kind: 'access_declined' },
      });
      return { ok: true };
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
      const openIds = await openProjectIds(auth);
      const directoryFull = auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin';
      const onProjects = await auth.db.projectMember.findMany({
        where: {
          userId: { in: members.map((m) => m.userId) },
          ...(!directoryFull && openIds ? { projectId: { in: [...openIds] } } : {}),
        },
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
          signsInWith:
            u?.authProvider === 'microsoft'
              ? 'Microsoft'
              : u?.authProvider === 'google'
                ? 'Google'
                : u?.authProvider === 'email'
                  ? 'Email'
                  : '-',
          projects: (projectsByUser.get(m.userId) ?? []).join(', ') || 'None',
        };
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
