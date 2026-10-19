const DISMISS_KEY = 'bt-pwa-install-dismissed';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
}

export function isIosHomeScreenCandidate(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (isStandaloneDisplay()) return false;
  const ua = navigator.userAgent;
  const iPhone = /iphone|ipod/i.test(ua);
  const iPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!iPhone && !iPad) return false;
  const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  return safari;
}

export function readInstallDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeInstallDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}
