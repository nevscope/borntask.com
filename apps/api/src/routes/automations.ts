import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { automationRuleSchema, mergeDefaultAutomations } from '@borntask/shared';
import { requireAuth, type Authed } from '../context.js';
import { forbidden, sendError } from '../errors.js';
import { assertCanManageOpenProject, requireOpenProject, requireOpenProjectWrite } from '../lib/projectAccess.js';

async function assertCanManage(auth: Authed, project: { id: string; leadId: string | null }) {
  await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can change automations.');
}

async function canManage(auth: Authed, project: { id: string; leadId: string | null }) {
  try {
    await assertCanManage(auth, project);
    return true;
  } catch {
    return false;
  }
}

async function statusSlugs(auth: Authed, workflowId: string) {
  const rows = await auth.db.workflowStatus.findMany({ where: { workflowId }, select: { slug: true } });
  return rows.map((row) => row.slug);
}

async function present(
  auth: Authed,
  project: { workflowId: string },
  rows: { onStatusSlug: string; action: string; roleSlug: string; enabled: boolean }[],
) {
  return mergeDefaultAutomations(
    rows.map((row) => ({
      onStatusSlug: row.onStatusSlug,
      action: row.action as 'assign_role' | 'notify_role',
      roleSlug: row.roleSlug,
      enabled: row.enabled,
    })),
    await statusSlugs(auth, project.workflowId),
  );
}

export const automationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:key/automations', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await requireOpenProject(auth, key);
      const rows = await auth.db.automation.findMany({ where: { projectId: project.id } });
      return { automations: await present(auth, project, rows), canManage: await canManage(auth, project) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/projects/:key/automations', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.via === 'mcp') throw forbidden('MCP cannot create or edit automations.');
      const key = (req.params as { key: string }).key;
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManage(auth, project);
      const body = z.object({ automations: z.array(automationRuleSchema).max(40) }).parse(req.body);
      const seen = new Set<string>();
      const unique = [];
      for (const row of body.automations) {
        const id = `${row.onStatusSlug}:${row.action}`;
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(row);
      }
      const merged = await present(auth, project, unique);
      await auth.db.automation.deleteMany({ where: { projectId: project.id } });
      if (merged.length) {
        await auth.db.automation.createMany({
          data: merged.map((row) => ({
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
      return { automations: await present(auth, project, rows), canManage: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
