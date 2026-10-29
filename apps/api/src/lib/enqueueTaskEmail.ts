import { prisma } from '../db.js';
import { config } from '../env.js';
import type { Authed } from '../context.js';
import { enqueueMail } from './enqueueMail.js';
import { htmlToPlain, replyMailbox } from '@borntask/shared';
import { signReplyToken } from './replyToken.js';

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export async function emailAllowed(auth: Authed, userId: string, event: string): Promise<boolean> {
  if (userId === auth.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailPerTask: true } });
  if (!user) return false;
  const pref = await auth.db.notificationPreference.findFirst({
    where: { userId, event, channel: 'email' },
  });
  if (pref) return pref.enabled;
  return user.emailPerTask && event !== 'digest_ready';
}

export async function enqueueTaskEventEmail(
  auth: Authed,
  userId: string,
  event: string,
  input: {
    taskId: string;
    taskKey: string;
    title: string;
    projectName: string;
    statusName?: string;
    actorName: string;
    eventLabel: string;
    comment?: string;
    url: string;
  },
): Promise<void> {
  if (!(await emailAllowed(auth, userId, event))) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) return;
  const domain = process.env.MAIL_REPLY_DOMAIN?.trim() || replyMailbox();
  const replyTo = `reply+${signReplyToken(userId, input.taskId, config.sessionSecret)}@${domain}`;
  await enqueueMail({
    kind: 'task-event',
    to: user.email,
    greetingName: firstName(user.name),
    actorName: input.actorName,
    eventLabel: input.eventLabel,
    taskKey: input.taskKey,
    title: input.title,
    projectName: input.projectName,
    statusName: input.statusName,
    comment: input.comment ? htmlToPlain(input.comment).slice(0, 600) : undefined,
    url: input.url,
    replyTo,
    profileUrl: `${config.publicUrl.replace(/\/$/, '')}/settings/profile`,
  });
}
