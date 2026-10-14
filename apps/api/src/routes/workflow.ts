import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { forbidden, notFound, sendError } from '../errors.js';
import { loadWorkflow } from '../lib/loadProject.js';

const transitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  roles: z.array(z.string()),
  requireComment: z.boolean().default(false),
  label: z.string().nullable().optional(),
});

const saveSchema = z.object({
  name: z.string().trim().min(1).optional(),
  transitions: z.array(transitionSchema),
});

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workflows', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const rows = await auth.db.workflow.findMany({ orderBy: { name: 'asc' } });
      return Promise.all(rows.map((w) => loadWorkflow(auth.db, w.id).then((wf) => ({
        id: wf.id,
        name: wf.name,
        statuses: wf.statuses,
        transitions: wf.transitions,
      }))));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/workflows/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const id = (req.params as { id: string }).id;
      const wf = await loadWorkflow(auth.db, id);
      return { id: wf.id, name: wf.name, statuses: wf.statuses, transitions: wf.transitions };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/workflows/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.workspaceRole !== 'owner' && auth.workspaceRole !== 'admin') {
        throw forbidden('Only the owner or an admin can edit workflows.');
      }
      const id = (req.params as { id: string }).id;
      const input = saveSchema.parse(req.body);
      const existing = await auth.db.workflow.findFirst({ where: { id } });
      if (!existing) throw notFound();
      if (input.name) {
        await auth.db.workflow.update({ where: { id }, data: { name: input.name } });
      }
      const wf = await loadWorkflow(auth.db, id);
      const roles = await auth.db.projectRole.findMany();
      const roleIdBySlug = Object.fromEntries(roles.map((r) => [r.slug, r.id]));
      await auth.db.workflowTransition.deleteMany({ where: { workflowId: id } });
      for (const t of input.transitions) {
        const fromId = wf.statusIdBySlug[t.from];
        const toId = wf.statusIdBySlug[t.to];
        if (!fromId || !toId) continue;
        await auth.db.workflowTransition.create({
          data: {
            tenantId: auth.tenantId,
            workflowId: id,
            fromStatusId: fromId,
            toStatusId: toId,
            allowedRoleIds: t.roles.map((s) => roleIdBySlug[s]).filter((x): x is string => !!x),
            requireComment: t.requireComment,
            label: t.label ?? null,
          },
        });
      }
      const next = await loadWorkflow(auth.db, id);
      return { id: next.id, name: next.name, statuses: next.statuses, transitions: next.transitions };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
