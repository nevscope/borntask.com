export const QUEUE = {
  import: 'borntask-import',
  notify: 'borntask-notify',
  purge: 'borntask-purge',
  github: 'borntask-github',
} as const;

export const JOB = {
  asanaImport: 'asana-import',
  chatPost: 'chat-post',
  chatApp: 'chat-app',
  digest: 'daily-digest',
  trashPurge: 'trash-purge',
  sendMail: 'send-mail',
  githubWebhook: 'github-webhook',
} as const;

export const LIVE_KINDS = ['create', 'patch', 'move', 'delete', 'restore', 'comment', 'reorder'] as const;
export type LiveKind = (typeof LIVE_KINDS)[number];

export function liveChannel(tenantId: string) {
  return `borntask:live:${tenantId}`;
}
