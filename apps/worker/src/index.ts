import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { JOB, QUEUE } from '@borntask/shared';
import { runAsanaImport } from './asanaImport.js';
import { runChatPost } from './chatPost.js';
import { deliverMail } from './mail.js';
import type { ChatPostJob } from '@borntask/shared';

const envFile = resolve(fileURLToPath(new URL('../../../.env', import.meta.url)));
try {
  process.loadEnvFile(envFile);
} catch {
  // The process environment is enough when .env is absent.
}

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6381';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

async function main() {
  const importQ = new Queue(QUEUE.import, { connection });
  const notifyQ = new Queue(QUEUE.notify, { connection });
  const purgeQ = new Queue(QUEUE.purge, { connection });

  const importWorker = new Worker(
    QUEUE.import,
    async (job) => {
      if (job.name !== JOB.asanaImport) return { ok: true, stub: true };
      const data = job.data as { tenantId: string; importJobId: string; actorId: string };
      return runAsanaImport(data);
    },
    { connection },
  );

  const notifyWorker = new Worker(
    QUEUE.notify,
    async (job) => {
      if (job.name === JOB.chatPost) return runChatPost(job.data as ChatPostJob);
      if (job.name !== JOB.sendMail) {
        console.log(`[notify] stub ${job.name} ${job.id}`);
        return { ok: true, stub: true };
      }
      return deliverMail(job.data);
    },
    { connection },
  );

  const purgeWorker = new Worker(
    QUEUE.purge,
    async (job) => {
      if (job.name !== JOB.trashPurge) return { ok: false, reason: 'unknown_job' };
      console.log(`[purge] stub ${job.id}`);
      return { ok: true, stub: true };
    },
    { connection },
  );

  for (const w of [importWorker, notifyWorker, purgeWorker]) {
    w.on('failed', (job, err) => console.error(`[${w.name}] failed`, job?.id, err));
  }

  console.log(`borntask-worker listening on ${redisUrl}`);
  console.log(`queues: ${QUEUE.import}, ${QUEUE.notify}, ${QUEUE.purge}`);

  const shutdown = async () => {
    await Promise.all([
      importWorker.close(),
      notifyWorker.close(),
      purgeWorker.close(),
      importQ.close(),
      notifyQ.close(),
      purgeQ.close(),
    ]);
    connection.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
