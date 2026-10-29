import { PrismaClient } from '@prisma/client';
import {
  dateKeyInZone,
  DEFAULT_DIGEST_HOUR,
  shouldSendDigest,
  workingDaysBetween,
  type MailJob,
} from '@borntask/shared';
import { htmlToPlain } from '@borntask/shared';
import { deliverMail } from './mail.js';

const prisma = new PrismaClient();

function publicUrl(): string {
  return (process.env.PUBLIC_URL ?? 'http://localhost:5174').replace(/\/$/, '');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function localDateOnly(iso: Date, timeZone: string): string {
  return dateKeyInZone(iso, timeZone);
}

export async function buildDigestJob(userId: string, now = new Date()): Promise<MailJob | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { where: { isActive: true }, select: { tenantId: true } },
      notifyPrefs: true,
    },
  });
  if (!user) return null;
  const digestEmailPrefs = user.notifyPrefs.filter((row) => row.event === 'digest_ready' && row.channel === 'email');
  const emailEnabled = digestEmailPrefs.length === 0 || digestEmailPrefs.every((row) => row.enabled);
  if (
    !shouldSendDigest({
      digestMode: user.digestMode,
      emailEnabled,
      now,
      timeZone: user.timeZone || 'Europe/Malta',
      hour: user.digestHour || DEFAULT_DIGEST_HOUR,
    })
  ) {
    return null;
  }

  const tenantIds = user.memberships.map((m) => m.tenantId);
  if (!tenantIds.length) return null;

  const todayKey = dateKeyInZone(now, user.timeZone);
  const already = await prisma.notification.findFirst({
    where: {
      userId: user.id,
      kind: 'digest_sent',
      createdAt: { gte: new Date(now.getTime() - 36 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (already && dateKeyInZone(already.createdAt, user.timeZone) === todayKey) return null;

  const tasks = await prisma.task.findMany({
    where: {
      tenantId: { in: tenantIds },
      deletedAt: null,
      parentId: null,
      OR: [{ assigneeId: user.id }, { reporterId: user.id }],
    },
    include: {
      status: true,
      type: true,
      project: true,
    },
  });

  const due: Extract<MailJob, { kind: 'digest' }>['due'] = [];
  const overdue: typeof due = [];
  const staleIdeas: typeof due = [];
  const myTasksUrl = `${publicUrl()}/`;
  const itemUrl = (projectKey: string, number: number) =>
    `${publicUrl()}/p/${encodeURIComponent(projectKey)}/list?task=${encodeURIComponent(`${projectKey}-${number}`)}`;

  for (const task of tasks) {
    const key = `${task.project.key}-${task.number}`;
    const url = itemUrl(task.project.key, task.number);
    const row = { key, title: task.title, statusName: task.status.name, url };
    if (task.assigneeId === user.id && task.dueDate && task.status.category !== 'done') {
      const dueKey = localDateOnly(task.dueDate, user.timeZone);
      if (dueKey === todayKey) due.push(row);
      else if (dueKey < todayKey) overdue.push(row);
    }
    if (
      task.type.slug === 'idea' &&
      task.status.slug === 'idea' &&
      workingDaysBetween(task.createdAt, now, user.timeZone) > 5
    ) {
      staleIdeas.push({
        ...row,
        extra: `${workingDaysBetween(task.createdAt, now, user.timeZone)} working days`,
      });
    }
  }

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const comments = await prisma.comment.findMany({
    where: {
      tenantId: { in: tenantIds },
      deletedAt: null,
      createdAt: { gte: since },
      authorId: { not: user.id },
    },
    include: {
      author: { select: { name: true } },
      task: { include: { project: true } },
    },
    take: 40,
  });
  const needle = `@${user.name}`.toLowerCase();
  const mentions = comments
    .filter((c) => c.body.toLowerCase().includes(needle))
    .map((c) => {
      const key = `${c.task.project.key}-${c.task.number}`;
      return {
        key,
        title: c.task.title,
        url: itemUrl(c.task.project.key, c.task.number),
        extra: `${c.author.name} on ${key}: "${htmlToPlain(c.body).slice(0, 140)}"`,
      };
    });

  if (!due.length && !overdue.length && !mentions.length && !staleIdeas.length) return null;

  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: user.timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now);

  return {
    kind: 'digest',
    to: user.email,
    greetingName: firstName(user.name),
    dateLabel,
    myTasksUrl,
    profileUrl: `${publicUrl()}/settings/profile`,
    due,
    overdue,
    mentions,
    staleIdeas,
    footerNote: user.digestMode === 'daily' ? 'Sent at 08:00 every day.' : 'Sent at 08:00 on workdays.',
  };
}

export async function runDailyDigest(now = new Date()): Promise<{ ok: true; sent: number; skipped: number }> {
  const users = await prisma.user.findMany({
    where: { digestMode: { not: 'off' } },
    select: { id: true },
  });
  let sent = 0;
  let skipped = 0;
  for (const row of users) {
    const job = await buildDigestJob(row.id, now);
    if (!job) {
      skipped += 1;
      continue;
    }
    await deliverMail(job);
    const membership = await prisma.tenantMember.findFirst({
      where: { userId: row.id, isActive: true },
      select: { tenantId: true },
    });
    if (membership) {
      await prisma.notification.create({
        data: { tenantId: membership.tenantId, userId: row.id, kind: 'digest_sent' },
      });
    }
    sent += 1;
  }
  return { ok: true, sent, skipped };
}
