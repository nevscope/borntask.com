import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../context.js';
import { sendError } from '../errors.js';
import { mapTask, parseTaskKey } from '../lib/loadProject.js';

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/search', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const q = String((req.query as { q?: string }).q ?? '').trim();
      if (!q) return { tasks: [], projects: [] };
      const key = parseTaskKey(q.toUpperCase());
      if (key) {
        const project = await auth.db.project.findFirst({ where: { key: key.projectKey } });
        if (project) {
          const row = await auth.db.task.findFirst({
            where: { projectId: project.id, number: key.number, deletedAt: null },
            include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
          });
          if (row) return { tasks: [mapTask(row)], projects: [] };
        }
      }
      const tasks = await auth.db.task.findMany({
        where: {
          deletedAt: null,
          parentId: null,
          title: { contains: q },
        },
        take: 30,
        include: { type: true, status: true, previousStatus: true, section: true, project: true, labels: { include: { label: true } } },
      });
      const projects = await auth.db.project.findMany({
        where: { name: { contains: q }, archivedAt: null },
        take: 10,
      });
      return {
        tasks: tasks.map(mapTask),
        projects: projects.map((p) => ({ id: p.id, key: p.key, name: p.name, color: p.colour })),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
