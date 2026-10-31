import type { FastifyPluginAsync } from 'fastify';
import { reportsQuerySchema } from '@borntask/shared';
import { requireAuth } from '../context.js';
import { sendError } from '../errors.js';
import { workspaceReports } from '../lib/reports.js';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reports/workspace', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const query = reportsQuerySchema.parse(req.query);
      return await workspaceReports(auth, query);
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
