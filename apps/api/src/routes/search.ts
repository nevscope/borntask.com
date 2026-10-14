import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../context.js';
import { sendError } from '../errors.js';
import { parseTaskKey, taskKey } from '../lib/loadProject.js';
import { remapTypeSlug, statusTone } from '../lib/mappers.js';

function snippetAround(text: string, q: string, radius = 42): string {
  const hay = text.replace(/\s+/g, ' ').trim();
  const i = hay.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return hay.slice(0, radius * 2);
  const start = Math.max(0, i - radius);
  const end = Math.min(hay.length, i + q.length + radius);
  return `${start > 0 ? '…' : ''}${hay.slice(start, end)}${end < hay.length ? '…' : ''}`;
}

const taskInclude = {
  type: true,
  status: true,
  section: true,
  project: true,
  assignee: true,
  comments: { where: { deletedAt: null }, include: { author: true } },
} as const;

type MatchField = 'title' | 'description' | 'comment' | 'key';

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/search', async (req, reply) => {
    const started = Date.now();
    try {
      const auth = await requireAuth(req);
      const q = String((req.query as { q?: string }).q ?? '').trim();
      if (!q) return { hits: [], tookMs: Date.now() - started };

      const toHit = (
        row: {
          number: number;
          title: string;
          description: string | null;
          type: { slug: string };
          status: { slug: string; name: string; category: string };
          section: { name: string } | null;
          project: { key: string; name: string; colour: string };
          assignee: { name: string } | null;
          comments: { body: string; author: { name: string } }[];
        },
        matchField: MatchField,
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

      const classify = (row: {
        title: string;
        description: string | null;
        comments: { body: string; author: { name: string } }[];
      }): { matchField: MatchField; matchSnippet: string; commentAuthor: string | null } => {
        const n = q.toLowerCase();
        if (row.title.toLowerCase().includes(n)) return { matchField: 'title', matchSnippet: row.title, commentAuthor: null };
        if ((row.description ?? '').toLowerCase().includes(n)) {
          return { matchField: 'description', matchSnippet: snippetAround(row.description ?? '', q), commentAuthor: null };
        }
        const c = row.comments.find((x) => x.body.toLowerCase().includes(n));
        if (c) return { matchField: 'comment', matchSnippet: snippetAround(c.body, q), commentAuthor: c.author.name };
        return { matchField: 'title', matchSnippet: row.title, commentAuthor: null };
      };

      const key = parseTaskKey(q.toUpperCase());
      if (key) {
        const project = await auth.db.project.findFirst({ where: { key: key.projectKey } });
        if (project) {
          const row = await auth.db.task.findFirst({
            where: { projectId: project.id, number: key.number, deletedAt: null },
            include: taskInclude,
          });
          if (row) return { hits: [toHit(row, 'key', row.title, null)], tookMs: Date.now() - started };
        }
      }

      const rows = await auth.db.task.findMany({
        where: {
          deletedAt: null,
          parentId: null,
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { comments: { some: { deletedAt: null, body: { contains: q } } } },
          ],
        },
        take: 40,
        include: taskInclude,
      });

      return {
        hits: rows.map((row) => {
          const m = classify(row);
          return toHit(row, m.matchField, m.matchSnippet, m.commentAuthor);
        }),
        tookMs: Date.now() - started,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
