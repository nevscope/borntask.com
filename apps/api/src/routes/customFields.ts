import type { FastifyPluginAsync } from 'fastify';
import { CUSTOM_FIELD_TYPES } from '@borntask/shared';
import { z } from 'zod';
import { requireAuth } from '../context.js';
import { forbidden, notFound, sendError } from '../errors.js';
import {
  createCustomField,
  ensureFoundOnField,
  listProjectCustomFields,
  updateCustomField,
} from '../lib/customFields.js';
import { assertCanManageOpenProject, requireOpenProject, requireOpenProjectWrite } from '../lib/projectAccess.js';

const createSchema = z.object({
  name: z.string(),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string()).optional(),
  appliesTo: z.array(z.string()).optional(),
});

const patchSchema = z.object({
  name: z.string().optional(),
  options: z.array(z.string()).optional(),
  appliesTo: z.array(z.string()).optional(),
});

export const customFieldRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:key/custom-fields', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const project = await requireOpenProject(auth, (req.params as { key: string }).key);
      return { customFields: await listProjectCustomFields(auth.db, project.id) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/custom-fields', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.via === 'mcp') throw forbidden('MCP cannot change project settings.');
      const project = await requireOpenProjectWrite(auth, (req.params as { key: string }).key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can add custom fields.');
      const body = createSchema.parse(req.body);
      const field = await createCustomField(auth.db, {
        tenantId: auth.tenantId,
        projectId: project.id,
        name: body.name,
        type: body.type,
        options: body.options,
        appliesTo: body.appliesTo,
      });
      return field;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/projects/:key/custom-fields/found-on', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.via === 'mcp') throw forbidden('MCP cannot change project settings.');
      const project = await requireOpenProjectWrite(auth, (req.params as { key: string }).key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can add custom fields.');
      return ensureFoundOnField(auth.db, auth.tenantId, project.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/projects/:key/custom-fields/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.via === 'mcp') throw forbidden('MCP cannot change project settings.');
      const { key, id } = req.params as { key: string; id: string };
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can edit custom fields.');
      const field = await auth.db.customField.findFirst({ where: { id, projectId: project.id } });
      if (!field) throw notFound();
      const body = patchSchema.parse(req.body);
      return updateCustomField(auth.db, field, body);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/projects/:key/custom-fields/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      if (auth.via === 'mcp') throw forbidden('MCP cannot change project settings.');
      const { key, id } = req.params as { key: string; id: string };
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can remove custom fields.');
      const field = await auth.db.customField.findFirst({ where: { id, projectId: project.id } });
      if (!field) throw notFound();
      await auth.db.customField.delete({ where: { id: field.id } });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
