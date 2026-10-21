import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { JOB, QUEUE } from '@borntask/shared';
import { runAsanaImport } from './asanaImport.js';
import { runChatAppJob } from './chatApp.js';
import { runChatPost } from './chatPost.js';
import { runGitHubWebhookJob } from './githubWebhook.js';
import { deliverMail } from './mail.js';
import { runDailyDigest } from './digest.js';
import { runTrashPurge } from './trashPurge.js';
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
  const githubQ = new Queue(QUEUE.github, { connection });

  const importWorker = new Worker(
    QUEUE.import,
    async (job) => {
      if (job.name !== JOB.asanaImport) return { ok: true, stub: true };
      const data = job.data as { tenantId: string; importJobId: string; actorId: string };
      return runAsanaImport(data);
    },
    { connection, lockDuration: 2 * 60 * 60 * 1000, stalledInterval: 5 * 60 * 1000, maxStalledCount: 1 },
  );

  const notifyWorker = new Worker(
    QUEUE.notify,
    async (job) => {
      if (job.name === JOB.chatPost) return runChatPost(job.data as ChatPostJob);
      if (job.name === JOB.chatApp) return runChatAppJob(job.data as { event: Record<string, unknown> });
      if (job.name === JOB.digest) return runDailyDigest();
      if (job.name !== JOB.sendMail) {
        console.log(`[notify] stub ${job.name} ${job.id}`);
        return { ok: true, stub: true };
      }
      return deliverMail(job.data);
    },
    { connection },
  );

  const githubWorker = new Worker(
    QUEUE.github,
    async (job) => {
      if (job.name !== JOB.githubWebhook) return { ok: false, reason: 'unknown_job' };
      return runGitHubWebhookJob(job.data as { event: string; payload: Record<string, unknown> });
    },
    { connection },
  );

  const purgeWorker = new Worker(
    QUEUE.purge,
    async (job) => {
      if (job.name !== JOB.trashPurge) return { ok: false, reason: 'unknown_job' };
      return runTrashPurge(job.data as { dryRun?: boolean } | undefined);
    },
    { connection },
  );

  for (const w of [importWorker, notifyWorker, purgeWorker, githubWorker]) {
    w.on('failed', (job, err) => console.error(`[${w.name}] failed`, job?.id, err));
  }

  await purgeQ.upsertJobScheduler(
    'trash-purge',
    { every: 60 * 60 * 1000 },
    { name: JOB.trashPurge, data: {} },
  );
  await notifyQ.upsertJobScheduler(
    'daily-digest',
    { every: 10 * 60 * 1000 },
    { name: JOB.digest, data: {} },
  );

  console.log(`borntask-worker listening on ${redisUrl}`);
  console.log(`queues: ${QUEUE.import}, ${QUEUE.notify}, ${QUEUE.purge}, ${QUEUE.github}`);

  const shutdown = async () => {
    await Promise.all([
      importWorker.close(),
      notifyWorker.close(),
      purgeWorker.close(),
      githubWorker.close(),
      importQ.close(),
      notifyQ.close(),
      purgeQ.close(),
      githubQ.close(),
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
