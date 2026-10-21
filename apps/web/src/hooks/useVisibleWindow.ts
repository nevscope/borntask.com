import { useEffect, useRef, useState } from 'react';

export const TASK_PAGE_SIZE = 25;

/** Render the first `pageSize` items, then add another page when the sentinel enters the main scroll area. */
export function useVisibleWindow(total: number, resetKey: string, pageSize = TASK_PAGE_SIZE) {
  const [shown, setShown] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShown(pageSize);
  }, [resetKey, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || shown >= total) return;
    const scroller = document.querySelector<HTMLElement>('.bt-main-scroll');
    const root = scroller && scroller.contains(el) ? scroller : null;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown((n) => Math.min(n + pageSize, total));
        }
      },
      { root, rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, total, pageSize]);

  return { shown, sentinelRef, remaining: Math.max(0, total - shown) };
}
