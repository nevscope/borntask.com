import { useSearchParams } from 'react-router-dom';

/** The task drawer is driven by ?task=WEB-142 so any screen can open it and the URL is shareable. */
export function useTaskParam() {
  const [params, setParams] = useSearchParams();
  const taskKey = params.get('task');
  const openTask = (key: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('task', key);
      return next;
    });
  const closeTask = () =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('task');
      return next;
    });
  return { taskKey, openTask, closeTask };
}
