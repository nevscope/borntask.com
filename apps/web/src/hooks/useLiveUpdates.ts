import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BASE_URL } from '../api/http';
import { applyLiveTaskEvent, USE_TASK_MOCKS, type LiveTaskEvent } from '../api/queries';
import { liveDrawerGuard } from '../lib/liveDrawer';

function parseEvent(raw: string): LiveTaskEvent | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LiveTaskEvent>;
    if (typeof parsed.projectKey !== 'string' || typeof parsed.taskKey !== 'string') return null;
    return {
      tenantId: typeof parsed.tenantId === 'string' ? parsed.tenantId : '',
      projectKey: parsed.projectKey,
      taskKey: parsed.taskKey,
      kind: typeof parsed.kind === 'string' ? parsed.kind : 'patch',
      actorId: typeof parsed.actorId === 'string' ? parsed.actorId : undefined,
    };
  } catch {
    return null;
  }
}

export function useLiveUpdates(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || USE_TASK_MOCKS) return;
    let closed = false;
    let source: EventSource | null = null;
    let timer = 0;
    let delay = 1000;

    const connect = () => {
      if (closed) return;
      const es = new EventSource(`${BASE_URL}/stream`, { withCredentials: true });
      source = es;
      es.addEventListener('task', (message) => {
        const event = parseEvent((message as MessageEvent<string>).data);
        if (!event) return;
        const drawer = liveDrawerGuard();
        const same = drawer?.taskKey === event.taskKey;
        const fromSelf = Boolean(event.actorId && drawer?.actorId && event.actorId === drawer.actorId);
        const dirty = Boolean(same && drawer?.isDirty());
        if (same && dirty && !fromSelf) {
          drawer?.onRemoteChange();
          applyLiveTaskEvent(qc, event, { skipTask: true });
          return;
        }
        applyLiveTaskEvent(qc, event, { skipTask: same && dirty });
      });
      es.onopen = () => {
        delay = 1000;
      };
      es.onerror = () => {
        es.close();
        if (closed) return;
        timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30_000);
      };
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      source?.close();
    };
  }, [enabled, qc]);
}
