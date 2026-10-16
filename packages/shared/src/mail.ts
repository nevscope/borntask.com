import { z } from 'zod';

const inviteMailSchema = z.object({
  kind: z.literal('invite'),
  to: z.string().email(),
  inviteUrl: z.string().url(),
  workspaceName: z.string().min(1),
  inviterName: z.string().min(1),
  roleLabel: z.string().min(1),
  message: z.string().nullable().optional(),
  expiresAt: z.string().min(1),
});

const wrongAccountMailSchema = z.object({
  kind: z.literal('wrong-account'),
  to: z.string().email(),
  requesterName: z.string().min(1),
  requesterEmail: z.string().email(),
  invitedEmail: z.string().email(),
  workspaceName: z.string().min(1),
  peopleUrl: z.string().url(),
});

const digestItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  statusName: z.string().optional(),
  url: z.string().url(),
  extra: z.string().optional(),
});

const digestMailSchema = z.object({
  kind: z.literal('digest'),
  to: z.string().email(),
  greetingName: z.string().min(1),
  dateLabel: z.string().min(1),
  myTasksUrl: z.string().url(),
  profileUrl: z.string().url(),
  due: z.array(digestItemSchema),
  overdue: z.array(digestItemSchema),
  mentions: z.array(digestItemSchema),
  staleIdeas: z.array(digestItemSchema),
  footerNote: z.string().min(1),
});

export const mailJobSchema = z.discriminatedUnion('kind', [inviteMailSchema, wrongAccountMailSchema, digestMailSchema]);
export type MailJob = z.infer<typeof mailJobSchema>;
