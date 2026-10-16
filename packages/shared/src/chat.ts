export const CHAT_EVENT_KEYS = [
  'assigned',
  'ready_for_testing',
  'deployed',
  'mention',
  'status_change',
  'new_idea',
] as const;

export type ChatEventKey = (typeof CHAT_EVENT_KEYS)[number];
export type ChatEvents = Record<ChatEventKey, boolean>;

export const PERSONAL_CHAT_EVENT_KEYS = [
  'assigned',
  'mention',
  'watch_stage',
  'watch_comment',
  'reporter_deployed',
] as const;

export type PersonalChatEventKey = (typeof PERSONAL_CHAT_EVENT_KEYS)[number];

export type PersonalChatPrefs = Record<PersonalChatEventKey, boolean>;

export function defaultPersonalChatPrefs(): PersonalChatPrefs {
  return {
    assigned: false,
    mention: false,
    watch_stage: false,
    watch_comment: false,
    reporter_deployed: false,
  };
}

export function firstConnectPersonalChatPrefs(): PersonalChatPrefs {
  return {
    assigned: true,
    mention: true,
    watch_stage: false,
    watch_comment: false,
    reporter_deployed: false,
  };
}

export type ChatPostJob = {
  tenantId: string;
  projectId: string;
  userId?: string;
  event: ChatEventKey | PersonalChatEventKey;
  title: string;
  taskKey: string;
  projectName: string;
  text: string;
  url: string;
};

export function defaultChatEvents(): ChatEvents {
  const events: ChatEvents = {
    assigned: true,
    ready_for_testing: true,
    deployed: true,
    mention: true,
    status_change: false,
    new_idea: false,
  };
  return events;
}

export function parseChatEvents(value: unknown): ChatEvents {
  const events = defaultChatEvents();
  if (!value || typeof value !== 'object') return events;
  const src = value as Record<string, unknown>;
  for (const key of CHAT_EVENT_KEYS) {
    if (typeof src[key] === 'boolean') events[key] = src[key];
  }
  return events;
}

export function chatMeta(value: unknown): { lastPostedAt: string | null; lastError: string | null } {
  if (!value || typeof value !== 'object') return { lastPostedAt: null, lastError: null };
  const src = value as Record<string, unknown>;
  return {
    lastPostedAt: typeof src.lastPostedAt === 'string' ? src.lastPostedAt : null,
    lastError: typeof src.lastError === 'string' ? src.lastError : null,
  };
}

export function isChatWebhook(url: string): boolean {
  return /^https:\/\/chat\.googleapis\.com\/.+\/spaces\/[^/\s?#]+/i.test(url.trim());
}

export function maskWebhook(url: string): string {
  if (!isChatWebhook(url)) return 'https://chat.googleapis.com/v1/spaces/••••••/messages?key=••••';
  return url
    .trim()
    .replace(/(\/spaces\/)[^/?#]+/, '$1••••••')
    .replace(/([?&](?:key|token)=)[^&#]+/gi, '$1••••');
}

export const CHAT_TASK_TYPES = ['bug', 'idea', 'improvement', 'feature'] as const;
export type ChatTaskType = (typeof CHAT_TASK_TYPES)[number];

export type ParsedSlashCommand = {
  type: ChatTaskType;
  projectKey: string;
  title: string;
};

const SLASH_BODY = /^(bug|idea|improvement|feature)\s+([A-Za-z][A-Za-z0-9]{1,11})\s+(.+)$/i;

export function parseSlashCommand(text: string): ParsedSlashCommand | 'usage' | null {
  const raw = text.replace(/\u00a0/g, ' ').trim();
  if (!raw) return null;
  const isSlash = /^\/borntask\b/i.test(raw);
  const body = raw.replace(/^\/borntask\s*/i, '').trim();
  if (isSlash && (!body || body === '?' || /^help$/i.test(body))) return 'usage';
  const match = body.match(SLASH_BODY);
  if (!match) return isSlash ? 'usage' : null;
  return {
    type: match[1]!.toLowerCase() as ChatTaskType,
    projectKey: match[2]!.toUpperCase(),
    title: match[3]!.trim(),
  };
}

export type ChatAppIntent =
  | { kind: 'slash'; type: ChatTaskType; projectKey: string; title: string }
  | { kind: 'create_message'; title: string; description: string; sourceUrl?: string }
  | { kind: 'approve'; taskKey: string }
  | { kind: 'reject'; taskKey: string; comment: string }
  | { kind: 'reject_need_comment'; taskKey: string }
  | { kind: 'added' }
  | { kind: 'help' }
  | { kind: 'ignore' };

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function chatActorEmail(event: Record<string, unknown>): string {
  const user = asObj(event.user);
  return asStr(user.email).trim().toLowerCase();
}

function actionName(event: Record<string, unknown>): string {
  const common = asObj(event.common);
  const action = asObj(event.action);
  return (asStr(common.invokedFunction) || asStr(action.actionMethodName) || asStr(action.function)).toLowerCase();
}

function actionParams(event: Record<string, unknown>): Record<string, string> {
  const action = asObj(event.action);
  const raw = action.parameters;
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const item = asObj(row);
      const key = asStr(item.key);
      if (key) out[key] = asStr(item.value);
    }
  }
  return out;
}

function formComment(event: Record<string, unknown>): string {
  const common = asObj(event.common);
  const inputs = asObj(common.formInputs);
  const comment = asObj(inputs.comment);
  const strings = asObj(comment.stringInputs);
  const values = strings.value;
  if (Array.isArray(values) && typeof values[0] === 'string') return values[0].trim();
  if (typeof event.comment === 'string') return event.comment.trim();
  return '';
}

export function interpretChatEvent(event: Record<string, unknown>): ChatAppIntent {
  const type = asStr(event.type);
  if (type === 'ADDED_TO_SPACE') return { kind: 'added' };
  if (type === 'REMOVED_FROM_SPACE') return { kind: 'ignore' };

  if (type === 'CARD_CLICKED') {
    const fn = actionName(event);
    const taskKey = actionParams(event).taskKey ?? '';
    if (!taskKey) return { kind: 'ignore' };
    if (fn === 'approve') return { kind: 'approve', taskKey };
    if (fn === 'reject') {
      const comment = formComment(event);
      return comment ? { kind: 'reject', taskKey, comment } : { kind: 'reject_need_comment', taskKey };
    }
    return { kind: 'ignore' };
  }

  const message = asObj(event.message);
  const annotation = Array.isArray(message.annotations) ? asObj(message.annotations[0]) : {};
  const slashMeta = asObj(message.slashCommand);
  const text = asStr(message.argumentText) || asStr(message.text);
  const parsed = parseSlashCommand(text);
  if (parsed === 'usage') return { kind: 'help' };
  if (parsed) return { kind: 'slash', ...parsed };

  const isCreateAction =
    actionName(event) === 'create_task' ||
    asStr(slashMeta.commandId) === 'create' ||
    asStr(annotation.type) === 'CREATE_TASK' ||
    (type === 'MESSAGE' && Object.keys(slashMeta).length > 0);
  if (isCreateAction || (type === 'MESSAGE' && asStr(event.messageAction) === 'create_task')) {
    const body = asStr(message.text).trim();
    const title = body.split('\n')[0]?.slice(0, 200) || 'Task from Google Chat';
    const sourceUrl = asStr(message.argumentText) || asStr(asObj(message.thread).name);
    return { kind: 'create_message', title, description: body, sourceUrl: sourceUrl || undefined };
  }

  if (type === 'MESSAGE' && /^\/borntask\b/i.test(asStr(message.text))) return { kind: 'help' };
  return { kind: 'ignore' };
}

export function chatAppUsageText(): string {
  return 'Use /borntask bug WEB title here. Types: bug, idea, improvement, feature. The project key is the letters on the task (WEB-12).';
}

export function chatCreatedCard(input: {
  taskKey: string;
  title: string;
  projectName: string;
  typeName: string;
  statusName: string;
  url: string;
}) {
  return {
    text: `Created ${input.taskKey} in ${input.projectName} · ${input.typeName} · ${input.statusName}`,
    cardsV2: [
      {
        cardId: 'borntask-created',
        card: {
          header: { title: `Created ${input.taskKey}`, subtitle: `${input.projectName} · ${input.typeName} · ${input.statusName}` },
          sections: [
            {
              widgets: [
                { textParagraph: { text: input.title } },
                {
                  buttonList: {
                    buttons: [{ text: 'Open', onClick: { openLink: { url: input.url } } }],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export function chatIdeaCard(input: {
  taskKey: string;
  title: string;
  projectName: string;
  fromName: string;
  url: string;
}) {
  const params = [{ key: 'taskKey', value: input.taskKey }];
  return {
    text: `New idea waiting for your approval. ${input.taskKey} · ${input.title} · from ${input.fromName}`,
    cardsV2: [
      {
        cardId: 'borntask-idea',
        card: {
          header: { title: 'New idea waiting for your approval', subtitle: `${input.taskKey} · ${input.projectName}` },
          sections: [
            {
              widgets: [
                { textParagraph: { text: `${input.title} · from ${input.fromName}` } },
                {
                  buttonList: {
                    buttons: [
                      {
                        text: 'Approve',
                        onClick: { action: { function: 'approve', parameters: params } },
                      },
                      {
                        text: 'Reject…',
                        onClick: { action: { function: 'reject', parameters: params } },
                      },
                      { text: 'Open in BornTask', onClick: { openLink: { url: input.url } } },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export function chatRejectDialog(taskKey: string) {
  return {
    actionResponse: {
      type: 'DIALOG',
      dialogAction: {
        dialog: {
          body: {
            sections: [
              {
                widgets: [
                  { textParagraph: { text: `Reject ${taskKey} needs a comment.` } },
                  { textInput: { name: 'comment', label: 'Why are you rejecting this idea?', type: 'MULTIPLE_LINE' } },
                  {
                    buttonList: {
                      buttons: [
                        {
                          text: 'Reject',
                          onClick: {
                            action: {
                              function: 'reject',
                              parameters: [{ key: 'taskKey', value: taskKey }],
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
}

export function chatCard(input: { title: string; subtitle: string; text: string; url: string; button?: string }) {
  return {
    text: `${input.subtitle}: ${input.title}. ${input.text} ${input.url}`,
    cardsV2: [
      {
        cardId: 'borntask',
        card: {
          header: { title: input.title, subtitle: input.subtitle },
          sections: [
            {
              widgets: [
                { textParagraph: { text: input.text } },
                {
                  buttonList: {
                    buttons: [
                      {
                        text: input.button ?? 'Open task',
                        onClick: { openLink: { url: input.url } },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
