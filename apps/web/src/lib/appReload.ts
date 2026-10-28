export const APP_RELOAD_CHANNEL = 'bt-app-reload';

export function reloadThisPage() {
  window.location.reload();
}

export function reloadAllOpenPages() {
  try {
    const channel = new BroadcastChannel(APP_RELOAD_CHANNEL);
    channel.postMessage('reload');
    channel.close();
  } catch {
    /* BroadcastChannel missing (older browsers) */
  }
  reloadThisPage();
}
