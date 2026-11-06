import { htmlToPlain, partitionMyComments } from '@borntask/shared';
import { prisma } from '../db.js';
import type { Authed } from '../context.js';
import { canOpenListed, openProjectIds } from './projectAccess.js';
import { taskKey } from './loadProject.js';
import { mapUser } from './mappers.js';

const LIMIT = 80;

function snippet(body: string) {
  const plain = htmlToPlain(body).replace(/\s+/g, ' ').trim();
  return plain.length > 180 ? `${plain.slice(0, 179)}…` : plain;
}

const commentInclude = {
  author: { select: { id: true, name: true, email: true } },
  task: {
    select: {
      number: true,
      title: true,
      assigneeId: true,
      projectId: true,
      deletedAt: true,
      parentId: true,
      project: { select: { key: true, name: true } },
    },
  },
} as const;

export async function listMyComments(auth: Authed) {
  const openIds = await openProjectIds(auth);
  const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } });
  const myName = me?.name ?? '';

  const myCommentIds = (
    await auth.db.comment.findMany({
      where: { authorId: auth.userId, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 400,
    })
  ).map((row) => row.id);

  const assignedTaskIds = (
    await auth.db.task.findMany({
      where: { assigneeId: auth.userId, deletedAt: null, parentId: null },
      select: { id: true },
      take: 200,
    })
  ).map((row) => row.id);

  const [posts, replies, assigned, mentioned] = await Promise.all([
    auth.db.comment.findMany({
      where: { authorId: auth.userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      include: commentInclude,
    }),
    myCommentIds.length
      ? auth.db.comment.findMany({
          where: { parentId: { in: myCommentIds }, authorId: { not: auth.userId }, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
          include: commentInclude,
        })
      : Promise.resolve([]),
    assignedTaskIds.length
      ? auth.db.comment.findMany({
          where: { taskId: { in: assignedTaskIds }, authorId: { not: auth.userId }, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
          include: commentInclude,
        })
      : Promise.resolve([]),
    auth.db.comment.findMany({
      where: {
        deletedAt: null,
        authorId: { not: auth.userId },
        body: { contains: `@${myName}` },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: commentInclude,
    }),
  ]);

  const visible = [...posts, ...replies, ...assigned, ...mentioned].filter(
    (row) => !row.task.deletedAt && !row.task.parentId && canOpenListed(openIds, row.task.projectId),
  );
  const unique = [...new Map(visible.map((row) => [row.id, row])).values()];
  const buckets = partitionMyComments(
    unique.map((row) => ({
      id: row.id,
      authorId: row.authorId,
      parentId: row.parentId,
      body: row.body,
      taskAssigneeId: row.task.assigneeId,
    })),
    auth.userId,
    myName,
  );
  const byId = new Map(unique.map((row) => [row.id, row]));

  const present = (ids: string[]) =>
    ids
      .flatMap((id) => {
        const row = byId.get(id);
        if (!row) return [];
        return [{
          id: row.id,
          body: snippet(row.body),
          createdAt: row.createdAt.toISOString(),
          parentId: row.parentId ?? null,
          author: mapUser(row.author),
          taskKey: taskKey(row.task.project.key, row.task.number),
          taskTitle: row.task.title,
          projectKey: row.task.project.key,
          projectName: row.task.project.name,
        }];
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, LIMIT);

  return {
    replies: present(buckets.replies),
    assignedComments: present(buckets.assignedComments),
    mentions: present(buckets.mentions),
    posts: present(buckets.posts),
  };
}
