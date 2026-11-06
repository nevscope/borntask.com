import { PrismaClient } from '@prisma/client';
import {
  clipDigestQuote,
  dateKeyInZone,
  DEFAULT_DIGEST_HOUR,
  resolveEmailCadence,
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

  type DigestItem = NonNullable<Extract<MailJob, { kind: 'digest' }>['waitingOnYou']>[number];
  const due: DigestItem[] = [];
  const overdue: DigestItem[] = [];
  const staleIdeas: DigestItem[] = [];
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
  const mentionCadence = resolveEmailCadence({
    event: 'mention',
    stored: user.notifyPrefs.find((row) => row.event === 'mention' && row.channel === 'email')?.emailCadence,
    emailEnabled: user.notifyPrefs.find((row) => row.event === 'mention' && row.channel === 'email')?.enabled,
    emailPerTask: user.emailPerTask,
  });
  const needle = `@${user.name}`.toLowerCase();
  const seenMentions = new Set<string>();
  const mentions = mentionCadence !== 'digest' ? [] : comments
    .filter((c) => c.body.toLowerCase().includes(needle))
    .flatMap((c) => {
      if (seenMentions.has(c.id)) return [];
      seenMentions.add(c.id);
      const key = `${c.task.project.key}-${c.task.number}`;
      return [{
        key,
        title: `${c.author.name} on ${key}`,
        url: itemUrl(c.task.project.key, c.task.number),
        extra: `"${clipDigestQuote(htmlToPlain(c.body))}"`,
      }];
    });

  const notes = await prisma.notification.findMany({
    where: {
      userId: user.id,
      tenantId: { in: tenantIds },
      createdAt: { gte: since },
    },
    include: {
      actor: { select: { name: true } },
      task: { include: { project: true } },
    },
    take: 80,
  });
  const pendingAccess = await prisma.notification.findMany({
    where: {
      userId: user.id,
      tenantId: { in: tenantIds },
      kind: { startsWith: 'access_request' },
    },
    include: { actor: { select: { name: true } } },
    take: 40,
  });
  const waitingOnYou: DigestItem[] = [
    ...pendingAccess.map((row) => {
      const key = row.kind.slice('access_request:'.length).split(':')[0] || 'Access';
      return {
        key,
        title: `${row.actor?.name ?? 'Someone'} asked to open ${key}`,
        url: `${publicUrl()}/p/${encodeURIComponent(key)}/settings/members`,
      };
    }),
    ...due,
    ...overdue,
  ];
  const reportedByTask = new Map<string, DigestItem>();
  for (const row of notes) {
    if (!row.kind.startsWith('moved:') || !row.task || row.task.reporterId !== user.id) continue;
    const rest = row.kind.slice('moved:'.length);
    const split = rest.indexOf(':');
    const from = split < 0 ? '' : decodeURIComponent(rest.slice(0, split));
    const to = split < 0 ? '' : decodeURIComponent(rest.slice(split + 1));
    const key = `${row.task.project.key}-${row.task.number}`;
    reportedByTask.set(key, {
      key,
      title: row.task.title,
      url: itemUrl(row.task.project.key, row.task.number),
      extra: from && to ? `${from} → ${to}` : undefined,
    });
  }
  const reportedMoved = [...reportedByTask.values()];
  const handlerIds = [...new Set(notes.flatMap((row) => {
    if (!row.kind.startsWith('access_handled:')) return [];
    const handlerId = row.kind.slice('access_handled:'.length).split(':')[3];
    return handlerId ? [handlerId] : [];
  }))];
  const handlers = handlerIds.length
    ? await prisma.user.findMany({ where: { id: { in: handlerIds } }, select: { id: true, name: true } })
    : [];
  const handlerName = new Map(handlers.map((person) => [person.id, person.name]));
  const handledElse: DigestItem[] = notes
    .filter((row) => row.kind.startsWith('access_handled:'))
    .map((row) => {
      const parts = row.kind.slice('access_handled:'.length).split(':');
      const projectKey = parts[0] || 'Access';
      const outcome = parts[2] === 'declined' ? 'Declined' : 'Approved';
      const who = handlerName.get(parts[3] ?? '') ?? 'someone else';
      return {
        key: projectKey,
        title: `${outcome} by ${who}. Nothing to do.`,
        extra: `${outcome} · cleared for everyone`,
        url: `${publicUrl()}/p/${encodeURIComponent(projectKey)}/settings/members`,
      };
    });

  if (!waitingOnYou.length && !reportedMoved.length && !handledElse.length && !mentions.length && !staleIdeas.length) {
    return null;
  }

  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: user.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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
    waitingOnYou,
    reportedMoved,
    handledElse,
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
