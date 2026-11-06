export type AccessOutcome = 'approved' | 'declined';

export type AccessNotifyKind =
  | { state: 'pending'; projectKey: string; requestId: string | null }
  | { state: 'handled'; projectKey: string; requestId: string | null; outcome: AccessOutcome; handlerId: string };

export function accessRequestKind(projectKey: string, requestId: string): string {
  return `access_request:${projectKey}:${requestId}`;
}

export function accessHandledKind(projectKey: string, requestId: string, outcome: AccessOutcome, handlerId: string): string {
  return `access_handled:${projectKey}:${requestId}:${outcome}:${handlerId}`;
}

export function parseAccessNotifyKind(kind: string): AccessNotifyKind | null {
  if (kind.startsWith('access_handled:')) {
    const parts = kind.slice('access_handled:'.length).split(':');
    const [projectKey, requestId, outcome, handlerId] = parts;
    if (!projectKey || (outcome !== 'approved' && outcome !== 'declined') || !handlerId) return null;
    return { state: 'handled', projectKey, requestId: requestId || null, outcome, handlerId };
  }
  if (kind.startsWith('access_request:')) {
    const rest = kind.slice('access_request:'.length);
    const split = rest.indexOf(':');
    if (split < 0) return rest ? { state: 'pending', projectKey: rest, requestId: null } : null;
    const projectKey = rest.slice(0, split);
    const requestId = rest.slice(split + 1);
    if (!projectKey) return null;
    return { state: 'pending', projectKey, requestId: requestId || null };
  }
  if (kind === 'access_request') return { state: 'pending', projectKey: '', requestId: null };
  return null;
}
