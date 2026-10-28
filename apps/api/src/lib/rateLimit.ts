import { ApiError } from '../errors.js';
import { getRedis } from './queue.js';

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const redis = getRedis();
  const redisKey = `bt:rl:${key}`;
  const n = await redis.incr(redisKey);
  if (n === 1) await redis.expire(redisKey, windowSeconds);
  if (n > limit) {
    throw new ApiError(429, 'RATE_LIMIT', 'Too many tries. Wait a few minutes and try again.');
  }
}

export function clientIp(req: { ip?: string; headers: { [key: string]: unknown } }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]!.trim();
  return req.ip || 'unknown';
}
