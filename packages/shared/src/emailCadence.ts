export const PROFILE_EMAIL_EVENTS = [
  'assigned',
  'mention',
  'watched_stage',
  'watched_comment',
  'reported_stage',
  'reported_comment',
  'access_request',
] as const;

export function preferenceEventAliases(event: string): string[] {
  if (event === 'reported_stage') return ['reported_stage', 'reported_deployed'];
  return [event];
}

export type ProfileEmailEvent = (typeof PROFILE_EMAIL_EVENTS)[number];
export type EmailCadence = 'instantly' | 'digest' | 'off';

export function defaultEmailCadence(event: string): EmailCadence {
  return event === 'assigned' || event === 'mention' ? 'instantly' : 'digest';
}

export function resolveEmailCadence(input: {
  event: string;
  stored?: string | null;
  emailEnabled?: boolean | null;
  emailPerTask?: boolean;
}): EmailCadence {
  if (input.stored === 'instantly' || input.stored === 'digest' || input.stored === 'off') return input.stored;
  if (input.emailEnabled === true) return 'instantly';
  if (input.emailEnabled === false && input.emailPerTask === false) return 'off';
  return defaultEmailCadence(input.event);
}
