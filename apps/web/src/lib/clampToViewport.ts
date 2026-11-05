import { useLayoutEffect, useRef } from 'react';

/** Shift a positioned popover horizontally so it stays inside the viewport. */
export function clampToViewport(el: HTMLElement, pad = 16) {
  el.style.transform = '';
  const rect = el.getBoundingClientRect();
  let dx = 0;
  if (rect.right > window.innerWidth - pad) dx -= rect.right - (window.innerWidth - pad);
  if (rect.left + dx < pad) dx += pad - (rect.left + dx);
  el.style.transform = dx ? `translateX(${Math.round(dx)}px)` : '';
}

export function useClampToViewport<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const run = () => clampToViewport(el);
    run();
    window.addEventListener('resize', run);
    return () => window.removeEventListener('resize', run);
  }, [active]);
  return ref;
}
