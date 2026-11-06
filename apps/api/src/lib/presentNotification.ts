import { taskKey } from './loadProject.js';
import { mapUser } from './mappers.js';

export const DIGEST_SENT_KIND = 'digest_sent';

const kindSchema = new Set(['mention', 'assigned', 'moved', 'invite', 'github', 'access_request']);

export type NotificationRow = {
  id: string;
  kind: string;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
  task: { number: number; title: string; project: { key: string } } | null;
};

export function projectInviteKey(kind: string): string | null {
  return kind.startsWith('project_invite:') ? kind.slice('project_invite:'.length) || null : null;
}

export function accessRequestKey(kind: string): string | null {
  return kind.startsWith('access_request:') ? kind.slice('access_request:'.length) || null : null;
}

function who(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed || fallback;
}

function taskLabel(title: string | null, key: string | null): string | null {
  if (key && title) return `${key}: ${title}`;
  return key ?? title;
}

function uiKind(kind: string): 'mention' | 'assigned' | 'moved' | 'invite' | 'github' | 'access_request' {
  if (kindSchema.has(kind)) return kind as 'mention' | 'assigned' | 'moved' | 'invite' | 'github' | 'access_request';
  if (projectInviteKey(kind)) return 'invite';
  if (accessRequestKey(kind) || kind === 'access_request' || kind === 'access_granted' || kind === 'access_declined') {
    return kind === 'access_request' || accessRequestKey(kind) ? 'access_request' : 'invite';
  }
  if (kind === 'watched_comment') return 'mention';
  return 'moved';
}

export function isInboxKind(kind: string): boolean {
  return kind !== DIGEST_SENT_KIND;
}

export function textFor(kind: string, title: string | null, key: string | null, actorName: string | null) {
  const invited = projectInviteKey(kind);
  if (invited) return `${who(actorName, 'Someone')} invited you to ${invited}`;
  const requested = accessRequestKey(kind);
  if (requested) return `${who(actorName, 'Someone')} asked to open ${requested}`;
  const label = taskLabel(title, key);
  const actor = who(actorName, kind === 'moved' || kind === 'assigned' || kind === 'github' ? 'BornTask' : 'Someone');
  if (kind === 'mention') return `${actor} mentioned you on ${label ?? 'a task'}`;
  if (kind === 'assigned') return `You were assigned ${label ?? 'a task'}`;
  if (kind === 'moved') return `${actor} moved ${label ?? 'a task'}`;
  if (kind === 'watched_comment') return `${actor} commented on ${label ?? 'a task'}`;
  if (kind === 'invite') return `${actor} accepted an invitation`;
  if (kind === 'github') return `A linked pull request updated ${label ?? 'a task'}`;
  if (kind === 'access_granted') return 'You can now open the project you asked for.';
  if (kind === 'access_declined') return 'Your request to open a project was declined.';
  if (kind === 'access_request') return `${actor} asked to open a project.`;
  return label;
}

export function presentNotification(row: NotificationRow) {
  if (!isInboxKind(row.kind)) return null;
  const invited = projectInviteKey(row.kind);
  const requested = accessRequestKey(row.kind);
  const key = row.task ? taskKey(row.task.project.key, row.task.number) : null;
  const title = row.task?.title ?? null;
  const taskKinds = row.kind === 'mention' || row.kind === 'assigned' || row.kind === 'moved' || row.kind === 'github' || row.kind === 'watched_comment';
  if (taskKinds && !taskLabel(title, key)) return null;
  const text = textFor(row.kind, title, key, row.actor?.name ?? null);
  if (!text) return null;
  return {
    id: row.id,
    kind: uiKind(row.kind),
    text,
    taskKey: key,
    projectKey: invited ?? requested ?? row.task?.project.key ?? null,
    needsAccept: Boolean(invited),
    actor: row.actor ? mapUser(row.actor) : null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}
