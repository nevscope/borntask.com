import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../env.js';

const MAX_AGE_MS = 30 * 60 * 1000;

function sign(payload: string): string {
  return createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

export function createGithubState(data: { tenantId: string; projectKey: string; userId: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ ...data, n: randomBytes(16).toString('hex'), t: Date.now() }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function parseGithubState(state: string | undefined): { tenantId: string; projectKey: string; userId: string } | null {
  if (!state) return null;
  const dot = state.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      t?: number;
      tenantId?: string;
      projectKey?: string;
      userId?: string;
    };
    if (typeof data.t !== 'number' || Date.now() - data.t > MAX_AGE_MS) return null;
    if (!data.tenantId || !data.projectKey || !data.userId) return null;
    return { tenantId: data.tenantId, projectKey: data.projectKey, userId: data.userId };
  } catch {
    return null;
  }
}
