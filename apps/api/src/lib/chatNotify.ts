import { chatCard, type ChatEventKey, type ChatPostJob } from '@borntask/shared';
import type { Authed } from '../context.js';
import { config } from '../env.js';
import { prisma } from '../db.js';
import { getNotifyQueue, JOB } from './queue.js';

export function taskUrl(projectKey: string, taskKey: string): string {
  return `${config.publicUrl.replace(/\/$/, '')}/p/${encodeURIComponent(projectKey)}/list?task=${encodeURIComponent(taskKey)}`;
}

export async function enqueueChat(auth: Authed, job: Omit<ChatPostJob, 'tenantId'>): Promise<void> {
  try {
    await getNotifyQueue().add(JOB.chatPost, { ...job, tenantId: auth.tenantId } satisfies ChatPostJob);
  } catch (err) {
    console.error('[chat] could not queue', err);
  }
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
