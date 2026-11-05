import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../context.js';
import { prisma } from '../db.js';
import { forbidden, sendError } from '../errors.js';
import { isPlatformAdminEmail } from '../lib/platformAdmin.js';
import { listPlatformWorkspaces } from '../lib/platformWorkspaces.js';

export const platformRoutes: FastifyPluginAsync = async (app) => {
  app.get('/platform/workspaces', async (req, reply) => {
    try {
      const user = await requireUser(req);
      if (!isPlatformAdminEmail(user.email)) throw forbidden('Platform admin only.');
      return { workspaces: await listPlatformWorkspaces(prisma) };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
