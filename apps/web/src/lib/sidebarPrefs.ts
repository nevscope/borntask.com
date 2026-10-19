const KEY = 'bt-sidebar-collapsed';

export function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}
