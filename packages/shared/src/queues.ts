export const QUEUE = {
  import: 'borntask-import',
  notify: 'borntask-notify',
  purge: 'borntask-purge',
} as const;

export const JOB = {
  asanaImport: 'asana-import',
  chatPost: 'chat-post',
  digest: 'daily-digest',
  trashPurge: 'trash-purge',
} as const;
