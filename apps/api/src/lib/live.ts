import { liveChannel, type LiveKind } from '@borntask/shared';
import type { Authed } from '../context.js';
import { getRedis } from './queue.js';

export type LiveTaskEvent = {
  tenantId: string;
  projectKey: string;
  taskKey: string;
  kind: LiveKind;
  actorId: string;
};

export function publishTaskChange(
  auth: Pick<Authed, 'tenantId' | 'userId'>,
  task: { key: string; projectKey: string },
  kind: LiveKind,
) {
  publishLiveTask({
    tenantId: auth.tenantId,
    projectKey: task.projectKey,
    taskKey: task.key,
    kind,
    actorId: auth.userId,
  });
}

export function publishLiveTask(event: LiveTaskEvent) {
  const payload: LiveTaskEvent = {
    tenantId: event.tenantId,
    projectKey: event.projectKey,
    taskKey: event.taskKey,
    kind: event.kind,
    actorId: event.actorId,
  };
  void getRedis()
    .publish(liveChannel(event.tenantId), JSON.stringify(payload))
    .catch((err) => {
      console.error('[live] publish failed', err);
    });
}

export function subscribeLive(tenantId: string, onEvent: (event: LiveTaskEvent) => void) {
  const sub = getRedis().duplicate();
  const channel = liveChannel(tenantId);
  void sub.subscribe(channel).catch((err) => {
    console.error('[live] subscribe failed', err);
  });
  sub.on('message', (ch, message) => {
    if (ch !== channel) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message) as unknown;
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const row = parsed as Partial<LiveTaskEvent>;
    if (row.tenantId !== tenantId) return;
    if (typeof row.projectKey !== 'string' || typeof row.taskKey !== 'string') return;
    if (typeof row.kind !== 'string' || typeof row.actorId !== 'string') return;
    onEvent({
      tenantId: row.tenantId,
      projectKey: row.projectKey,
      taskKey: row.taskKey,
      kind: row.kind as LiveKind,
      actorId: row.actorId,
    });
  });
  return async () => {
    try {
      await sub.unsubscribe(channel);
    } catch {
      /* closed */
    }
    sub.disconnect();
  };
}
