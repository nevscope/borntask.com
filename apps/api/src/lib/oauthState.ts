import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../env.js';

const MAX_AGE_MS = 15 * 60 * 1000;

function sign(payload: string): string {
  return createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

/** Signed OAuth `state` so Google callback does not depend on the session cookie surviving a cross-site redirect. */
export function createOauthState(invite = ''): string {
  const payload = Buffer.from(
    JSON.stringify({ n: randomBytes(16).toString('hex'), t: Date.now(), invite: invite || undefined }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function parseOauthState(state: string | undefined): { invite?: string } | null {
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
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { t?: number; invite?: string };
    if (typeof data.t !== 'number' || Date.now() - data.t > MAX_AGE_MS) return null;
    return { invite: data.invite };
  } catch {
    return null;
  }
}
