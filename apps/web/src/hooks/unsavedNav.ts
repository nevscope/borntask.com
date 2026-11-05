/** True when leaving this screen. Overlay Back (same URL, different history state) is not leaving. */
export function shouldBlockUnsavedNav(
  dirty: boolean,
  current: { pathname: string; search: string; hash: string },
  next: { pathname: string; search: string; hash: string },
): boolean {
  if (!dirty) return false;
  return current.pathname !== next.pathname
    || current.search !== next.search
    || current.hash !== next.hash;
}
