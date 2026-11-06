import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../context.js';
import { sendError } from '../errors.js';
import { parseTaskKey, taskKey } from '../lib/loadProject.js';
import { collapseSearchRows, matchForCollapsed, type SearchMatchField } from '../lib/searchHits.js';
import { remapTypeSlug, statusTone } from '../lib/mappers.js';
import { canOpenListed, openProjectIds } from '../lib/projectAccess.js';

const taskInclude = {
  type: true,
  status: true,
  section: true,
  project: true,
  assignee: true,
  comments: { where: { deletedAt: null }, include: { author: true } },
} as const;

type HitTask = {
  id: string;
  parentId: string | null;
  deletedAt?: Date | null;
  number: number;
  title: string;
  description: string | null;
  type: { slug: string };
  status: { slug: string; name: string; category: string };
  section: { name: string } | null;
  project: { key: string; name: string; colour: string };
  assignee: { name: string } | null;
  comments: { body: string; author: { name: string } }[];
};

type LoadedTask = HitTask & { parent: HitTask | null };

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/search', async (req, reply) => {
    const started = Date.now();
    try {
      const auth = await requireAuth(req);
      const q = String((req.query as { q?: string }).q ?? '').trim();
      if (!q) return { hits: [], tookMs: Date.now() - started };

      const toHit = (
        row: HitTask,
        matchField: SearchMatchField,
        matchSnippet: string,
        commentAuthor: string | null,
      ) => ({
        key: taskKey(row.project.key, row.number),
        projectKey: row.project.key,
        projectName: row.project.name,
        projectColor: row.project.colour,
        title: row.title,
        type: remapTypeSlug(row.type.slug),
        statusId: row.status.slug,
        statusName: row.status.name,
        statusTone: statusTone(row.status.slug),
        statusCategory: row.status.category,
        sectionName: row.section?.name ?? null,
        assigneeName: row.assignee?.name ?? null,
        matchField,
        matchSnippet,
        commentAuthor,
      });

      const openIds = await openProjectIds(auth);
      const key = parseTaskKey(q.toUpperCase());
      if (key) {
        const project = await auth.db.project.findFirst({ where: { key: key.projectKey } });
        if (project && canOpenListed(openIds, project.id)) {
          const row = await auth.db.task.findFirst({
            where: { projectId: project.id, number: key.number, deletedAt: null },
            include: { ...taskInclude, parent: { include: taskInclude } },
          });
          if (row?.parentId && row.parent) {
            return { hits: [toHit(row.parent, 'key', row.parent.title, null)], tookMs: Date.now() - started };
          }
          if (row) return { hits: [toHit(row, 'key', row.title, null)], tookMs: Date.now() - started };
        }
      }

      const rows = await auth.db.task.findMany({
        where: {
          deletedAt: null,
          ...(openIds ? { projectId: { in: [...openIds] } } : {}),
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { comments: { some: { deletedAt: null, body: { contains: q } } } },
            { assignee: { name: { contains: q } } },
          ],
        },
        take: 80,
        include: { ...taskInclude, parent: { include: taskInclude } },
      });

      const collapsed = collapseSearchRows<HitTask, LoadedTask>(rows as unknown as LoadedTask[]).slice(0, 40);
      return {
        hits: collapsed.map(({ display, source }) => {
          const m = matchForCollapsed(
            q,
            {
              id: display.id,
              title: display.title,
              description: display.description,
              assigneeName: display.assignee?.name ?? null,
              comments: display.comments.map((c) => ({ body: c.body, authorName: c.author.name })),
            },
            {
              id: source.id,
              title: source.title,
              description: source.description,
              assigneeName: source.assignee?.name ?? null,
              comments: source.comments.map((c) => ({ body: c.body, authorName: c.author.name })),
            },
          );
          return toHit(display, m.matchField, m.matchSnippet, m.commentAuthor);
        }),
        tookMs: Date.now() - started,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
