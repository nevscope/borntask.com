import { type ChatEventKey, type ChatPostJob } from '@borntask/shared';
import type { Authed } from '../context.js';
import { config } from '../env.js';
import { prisma } from '../db.js';
import { getNotifyQueue, JOB } from './queue.js';

export function taskUrl(projectKey: string, taskKey: string, commentId?: string): string {
  const base = `${config.publicUrl.replace(/\/$/, '')}/p/${encodeURIComponent(projectKey)}/list?task=${encodeURIComponent(taskKey)}`;
  return commentId ? `${base}&comment=${encodeURIComponent(commentId)}` : base;
}

export async function enqueueChat(auth: Authed, job: Omit<ChatPostJob, 'tenantId'>): Promise<void> {
  try {
    await getNotifyQueue().add(JOB.chatPost, { ...job, tenantId: auth.tenantId } satisfies ChatPostJob);
  } catch (err) {
    console.error('[chat] could not queue', err);
  }
}

export async function enqueuePersonalChat(
  auth: Authed,
  userId: string,
  job: Omit<ChatPostJob, 'tenantId' | 'userId'>,
): Promise<void> {
  if (userId === auth.userId) return;
  try {
    await getNotifyQueue().add(JOB.chatPost, { ...job, tenantId: auth.tenantId, userId } satisfies ChatPostJob);
  } catch (err) {
    console.error('[chat] could not queue personal', err);
  }
}

export function mentionUserIds(body: string, people: { id: string; name: string }[]): string[] {
  const found = new Set<string>();
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  const hay = body.toLowerCase();
  for (const person of sorted) {
    const needle = `@${person.name}`.toLowerCase();
    if (needle.length > 1 && hay.includes(needle)) found.add(person.id);
  }
  return [...found];
}

export async function workspacePeople(auth: Authed): Promise<{ id: string; name: string }[]> {
  const members = await auth.db.tenantMember.findMany({
    where: { isActive: true },
    include: { user: { select: { id: true, name: true } } },
  });
  return members.map((m) => ({ id: m.user.id, name: m.user.name }));
}

export async function actorName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? 'Someone';
}

export async function userName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? null;
}

export function eventsForStatus(slug: string): ChatEventKey[] {
  const events: ChatEventKey[] = ['status_change'];
  if (slug === 'ready_for_testing') events.push('ready_for_testing');
  if (slug === 'deployed') events.push('deployed');
  return events;
}
