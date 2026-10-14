export type WelcomeSession = {
  kind: 'member' | 'guest';
  workspaceName: string;
  projectName: string | null;
  projectKey: string | null;
  projectRole: string | null;
};

export const WELCOME_KEY = 'bt-welcome';

export function readWelcome(): WelcomeSession | null {
  try {
    const raw = sessionStorage.getItem(WELCOME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WelcomeSession;
    if (parsed.kind !== 'member' && parsed.kind !== 'guest') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeWelcome(value: WelcomeSession) {
  sessionStorage.setItem(WELCOME_KEY, JSON.stringify(value));
}
