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

export const mailJobSchema = z.discriminatedUnion('kind', [inviteMailSchema, wrongAccountMailSchema]);
export type MailJob = z.infer<typeof mailJobSchema>;
