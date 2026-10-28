import { createHmac } from 'node:crypto';

export function signReplyToken(userId: string, taskId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(`${userId}.${taskId}`).digest('base64url').slice(0, 16);
  return `${userId}.${taskId}.${sig}`;
}

export function verifyReplyToken(token: string, secret: string): { userId: string; taskId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, taskId, sig] = parts;
  if (!userId || !taskId || !sig) return null;
  const expected = signReplyToken(userId, taskId, secret).split('.')[2];
  if (expected !== sig) return null;
  return { userId, taskId };
}
