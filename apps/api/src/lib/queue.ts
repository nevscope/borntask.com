import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { JOB, QUEUE } from '@borntask/shared';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6381';

let connection: Redis | undefined;
let importQueue: Queue | undefined;

function redis() {
  if (!connection) connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return connection;
}

export function getImportQueue() {
  if (!importQueue) importQueue = new Queue(QUEUE.import, { connection: redis() });
  return importQueue;
}

export { JOB, QUEUE };
