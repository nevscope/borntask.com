import { JOB, type MailJob } from '@borntask/shared';
import { getNotifyQueue } from './queue.js';

/** Queues a transactional email. A missing queue must not fail the invite. */
export async function enqueueMail(job: MailJob): Promise<void> {
  try {
    await getNotifyQueue().add(JOB.sendMail, job, {
      removeOnComplete: 100,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  } catch (err) {
    const dev = process.env.NODE_ENV !== 'production';
    if (dev && job.kind === 'invite') {
      console.log(`[BornTask] Invite for ${job.to}: ${job.inviteUrl}`);
    } else if (dev && job.kind === 'wrong-account') {
      console.log(`[BornTask] Wrong-account request: ${job.requesterEmail} asked for an invite meant for ${job.invitedEmail}`);
    } else if (dev && job.kind === 'digest') {
      console.log(`[BornTask] Digest for ${job.to}`);
    } else if (dev && job.kind === 'login-code') {
      console.log(`[BornTask] DEV email sign-in for ${job.to}: code ${job.code}`);
    } else if (dev && job.kind === 'task-event') {
      console.log(`[BornTask] Task email for ${job.to}: ${job.taskKey} ${job.eventLabel}`);
    } else {
      console.error('[BornTask] Could not queue email', err instanceof Error ? err.message : 'unknown');
    }
  }
}

export function roleLabel(tenantRole: string, projectRoleName?: string | null): string {
  if (projectRoleName?.trim()) return projectRoleName.trim();
  const labels: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
    guest: 'Guest',
    viewer: 'Viewer',
  };
  return labels[tenantRole] ?? 'Member';
}
