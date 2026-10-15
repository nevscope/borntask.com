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

export type ChatPostJob = {
  tenantId: string;
  projectId: string;
  event: ChatEventKey;
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
