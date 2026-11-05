import { useSearchParams } from 'react-router-dom';
import { useMe } from '../api/queries';
import { recordLastViewed } from '../lib/lastViewed';

/** Keep the open drawer when changing list, board, project or settings. */
export function withTaskQuery(to: string, taskKey: string | null | undefined): string {
  if (!taskKey) return to;
  const qIndex = to.indexOf('?');
  const path = qIndex === -1 ? to : to.slice(0, qIndex);
  const params = new URLSearchParams(qIndex === -1 ? '' : to.slice(qIndex + 1));
  if (!params.has('task')) params.set('task', taskKey);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

/** The task drawer is driven by ?task=WEB-142 so any screen can open it and the URL is shareable. */
export function useTaskParam() {
  const [params, setParams] = useSearchParams();
  const userId = useMe().data?.user.id;
  const taskKey = params.get('task');
  const commentId = params.get('comment');
  const openTask = (key: string, meta?: { title?: string; projectKey?: string; replace?: boolean }) => {
    recordLastViewed(userId, { key, title: meta?.title, projectKey: meta?.projectKey });
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('task', key);
      next.delete('comment');
      return next;
    }, meta?.replace ? { replace: true } : undefined);
  };
  const closeTask = () =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('task');
      next.delete('comment');
      return next;
    }, { replace: true });
  return { taskKey, commentId, openTask, closeTask };
}
