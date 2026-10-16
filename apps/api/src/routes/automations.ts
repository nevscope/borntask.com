import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { automationRuleSchema, mergeDefaultAutomations } from '@borntask/shared';
import { requireAuth, type Authed } from '../context.js';
import { forbidden, notFound, sendError } from '../errors.js';

async function projectFor(auth: Authed, key: string) {
  const project = await auth.db.project.findFirst({ where: { key } });
  if (!project) throw notFound('Project not found.');
  if (auth.workspaceRole === 'guest') {
    const on = await auth.db.projectMember.findFirst({ where: { projectId: project.id, userId: auth.userId } });
    if (!on) throw forbidden("You're not on this project.");
  }
  return project;
}

async function assertCanManage(auth: Authed, projectId: string, leadId: string | null) {
  if (auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin' || leadId === auth.userId) return;
  const member = await auth.db.projectMember.findFirst({
    where: { projectId, userId: auth.userId },
    include: { roles: { include: { role: true } } },
  });
  if (member?.roles.some((role) => role.role.slug === 'lead')) return;
  throw forbidden('Only a project lead or workspace admin can change automations.');
}

function present(rows: { onStatusSlug: string; action: string; roleSlug: string; enabled: boolean }[]) {
  return mergeDefaultAutomations(
    rows.map((row) => ({
      onStatusSlug: row.onStatusSlug,
      action: row.action as 'assign_role' | 'notify_role',
      roleSlug: row.roleSlug,
      enabled: row.enabled,
    })),
  );
}

export const automationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:key/automations', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await projectFor(auth, key);
      await assertCanManage(auth, project.id, project.leadId);
      const rows = await auth.db.automation.findMany({ where: { projectId: project.id } });
      return { automations: present(rows), canManage: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/projects/:key/automations', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.via === 'mcp') throw forbidden('MCP cannot create or edit automations.');
      const key = (req.params as { key: string }).key;
      const project = await projectFor(auth, key);
      await assertCanManage(auth, project.id, project.leadId);
      const body = z.object({ automations: z.array(automationRuleSchema).max(40) }).parse(req.body);
      const seen = new Set<string>();
      const unique = [];
      for (const row of body.automations) {
        const id = `${row.onStatusSlug}:${row.action}`;
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(row);
      }
      await auth.db.automation.deleteMany({ where: { projectId: project.id } });
      if (unique.length) {
        await auth.db.automation.createMany({
          data: unique.map((row) => ({
            tenantId: auth.tenantId,
            projectId: project.id,
            onStatusSlug: row.onStatusSlug,
            action: row.action,
            roleSlug: row.roleSlug,
            enabled: row.enabled,
          })),
        });
      }
      const rows = await auth.db.automation.findMany({ where: { projectId: project.id } });
      return { automations: present(rows), canManage: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
