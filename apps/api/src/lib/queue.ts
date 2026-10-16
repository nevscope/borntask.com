import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { JOB, QUEUE } from '@borntask/shared';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6381';

let connection: Redis | undefined;
let importQueue: Queue | undefined;
let notifyQueue: Queue | undefined;
let githubQueue: Queue | undefined;

export function getRedis() {
  if (!connection) connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return connection;
}

function redis() {
  return getRedis();
}

export function getImportQueue() {
  if (!importQueue) importQueue = new Queue(QUEUE.import, { connection: redis() });
  return importQueue;
}

export function getNotifyQueue() {
  if (!notifyQueue) notifyQueue = new Queue(QUEUE.notify, { connection: redis() });
  return notifyQueue;
}

export function getGithubQueue() {
  if (!githubQueue) githubQueue = new Queue(QUEUE.github, { connection: redis() });
  return githubQueue;
}

export { JOB, QUEUE };
