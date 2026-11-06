import type { FastifyPluginAsync } from 'fastify';
import { createReleaseSchema, patchReleaseSchema, releasesQuerySchema } from '@borntask/shared';
import { requireAuth } from '../context.js';
import { sendError } from '../errors.js';
import { createRelease, deleteRelease, getRelease, listReleases, updateRelease } from '../lib/releases.js';

export const releaseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/releases', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const query = releasesQuerySchema.parse(req.query);
      return await listReleases(auth, query.projectKey);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/releases/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const query = releasesQuerySchema.parse(req.query);
      return await getRelease(auth, (req.params as { id: string }).id, query.projectKey);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/releases', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const body = createReleaseSchema.parse(req.body);
      return await createRelease(auth, body);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/releases/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const body = patchReleaseSchema.parse(req.body);
      return await updateRelease(auth, (req.params as { id: string }).id, body);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/releases/:id', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      await deleteRelease(auth, (req.params as { id: string }).id);
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
