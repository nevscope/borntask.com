import { useSearchParams } from 'react-router-dom';
import { recordLastViewed } from '../lib/lastViewed';

/** The task drawer is driven by ?task=WEB-142 so any screen can open it and the URL is shareable. */
export function useTaskParam() {
  const [params, setParams] = useSearchParams();
  const taskKey = params.get('task');
  const commentId = params.get('comment');
  const openTask = (key: string, meta?: { title?: string; projectKey?: string }) => {
    recordLastViewed({ key, title: meta?.title, projectKey: meta?.projectKey });
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('task', key);
      next.delete('comment');
      return next;
    });
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
