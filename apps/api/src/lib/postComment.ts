import { commentParentForClient, groupCommentReactions, skipWatcherBecauseMentioned } from '@borntask/shared';
import { persistDescription } from './descriptionHtml.js';
import { actorName, enqueueChat, enqueuePersonalChat, mentionUserIds, taskUrl, workspacePeople } from './chatNotify.js';
import { taskKey } from './loadProject.js';
import { publishTaskChange } from './live.js';
import { notifyInApp } from './notifyInApp.js';
import { enqueueTaskEventEmail } from './enqueueTaskEmail.js';
import { forbidden, notFound, validation } from '../errors.js';
import type { Authed } from '../context.js';

export async function postComment(
  auth: Authed,
  row: {
    id: string;
    projectId: string;
    number: number;
    title: string;
    project: { key: string; name: string };
    status: { name: string };
  },
  bodyHtml: string,
  parentId?: string | null,
) {
  const body = persistDescription(bodyHtml);
  if (!body.trim()) throw validation('Write a comment.');
  let parent: { id: string; parentId: string | null } | null = null;
  if (parentId) {
    parent = await auth.db.comment.findFirst({ where: { id: parentId, taskId: row.id, deletedAt: null } });
    if (!parent) throw notFound('Comment not found.');
    if (parent.parentId) throw forbidden('Replies can only be one level deep.');
  }
  const c = await auth.db.comment.create({
    data: {
      tenantId: auth.tenantId,
      taskId: row.id,
      authorId: auth.userId,
      parentId: parent?.id ?? null,
      body,
      via: auth.via === 'mcp' ? 'mcp' : 'app',
    },
  });
  if (auth.via === 'mcp') {
    await auth.db.activityLog.create({
      data: {
        tenantId: auth.tenantId,
        taskId: row.id,
        actorId: auth.userId,
        actorType: 'mcp',
        via: 'mcp',
        action: 'commented',
      },
    });
  }
  const name = await actorName(auth.userId);
  const commentKey = taskKey(row.project.key, row.number);
  const commentUrl = taskUrl(row.project.key, commentKey, c.id);
  const people = await workspacePeople(auth);
  const mentionedIds = body.includes('@') ? mentionUserIds(body, people) : [];
  if (mentionedIds.length) {
    const mentionJob = {
      projectId: row.projectId,
      event: 'mention' as const,
      title: row.title,
      taskKey: commentKey,
      projectName: row.project.name,
      text: `${name} mentioned someone in a comment.`,
      url: commentUrl,
    };
    await enqueueChat(auth, mentionJob);
    for (const userId of mentionedIds) {
      await notifyInApp(auth, userId, 'mention', { kind: 'mention', taskId: row.id });
      await enqueuePersonalChat(auth, userId, mentionJob);
      await enqueueTaskEventEmail(auth, userId, 'mention', {
        taskId: row.id,
        taskKey: commentKey,
        title: row.title,
        projectName: row.project.name,
        statusName: row.status.name,
        actorName: name,
        eventLabel: 'mentioned you',
        comment: body,
        url: commentUrl,
      });
    }
  }
  const watchers = await auth.db.taskWatcher.findMany({ where: { taskId: row.id } });
  const commentJob = {
    projectId: row.projectId,
    event: 'watch_comment' as const,
    title: row.title,
    taskKey: commentKey,
    projectName: row.project.name,
    text: `${name} commented.`,
    url: commentUrl,
  };
  for (const watcher of watchers) {
    if (skipWatcherBecauseMentioned(mentionedIds, watcher.userId)) continue;
    await notifyInApp(auth, watcher.userId, 'watched_comment', { kind: 'watched_comment', taskId: row.id });
    await enqueuePersonalChat(auth, watcher.userId, commentJob);
    await enqueueTaskEventEmail(auth, watcher.userId, 'watched_comment', {
      taskId: row.id,
      taskKey: commentKey,
      title: row.title,
      projectName: row.project.name,
      statusName: row.status.name,
      actorName: name,
      eventLabel: 'commented',
      comment: body,
      url: commentUrl,
    });
  }
  publishTaskChange(auth, { key: commentKey, projectKey: row.project.key }, 'comment');
  return mapComment(c, []);
}

export function mapComment(
  c: { id: string; authorId: string; parentId: string | null; body: string; via: string; createdAt: Date },
  reactions: { emoji: string; userId: string }[] = [],
  siblings?: { id: string; parentId?: string | null }[],
) {
  return {
    id: c.id,
    authorId: c.authorId,
    parentId: siblings ? commentParentForClient(siblings, c) : c.parentId,
    body: c.body,
    via: c.via === 'mcp' ? 'mcp' as const : 'app' as const,
    createdAt: c.createdAt.toISOString(),
    reactions: groupCommentReactions(reactions),
  };
}
