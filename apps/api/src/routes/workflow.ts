import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { forbidden, sendError } from '../errors.js';
import { deleteWorkflow } from '../lib/adminCatalog.js';
import { workflowView } from '../lib/loadProject.js';
import { saveWorkflowDefinition } from '../lib/saveWorkflow.js';

const transitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  roles: z.array(z.string()),
  requireComment: z.boolean().default(false),
  label: z.string().nullable().optional(),
});

const statusSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  category: z.enum(['backlog', 'active', 'review', 'done']),
  colour: z.string().optional().nullable(),
  wipLimit: z.number().int().min(1).nullable(),
});

const saveSchema = z.object({
  name: z.string().trim().min(1).optional(),
  statuses: z.array(statusSchema).optional(),
  remaps: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  transitions: z.array(transitionSchema),
});

function requireOwnerAdmin(role: string) {
  if (role !== 'owner' && role !== 'admin') throw forbidden('Only the owner or an admin can view or edit workflows.');
}

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workflows', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.workspaceRole === 'owner' || auth.workspaceRole === 'admin') {
        const rows = await auth.db.workflow.findMany({ orderBy: { name: 'asc' } });
        return Promise.all(rows.map((w) => workflowView(auth.db, w.id)));
      }
      if (auth.workspaceRole === 'guest' || auth.workspaceRole === 'viewer') {
        throw forbidden('Only the owner or an admin can view workflows.');
      }
      return auth.db.workflow.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/workflows/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const id = (req.params as { id: string }).id;
      return workflowView(auth.db, id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/workflows/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const id = (req.params as { id: string }).id;
      const input = saveSchema.parse(req.body);
      return await saveWorkflowDefinition(auth, id, input);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/workflows/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      requireOwnerAdmin(auth.workspaceRole);
      const id = (req.params as { id: string }).id;
      return await deleteWorkflow(auth, id);
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
