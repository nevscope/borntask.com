import type { FastifyPluginAsync } from 'fastify';
import { isIanaTimeZone, PROFILE_EMAIL_EVENTS, resolveEmailCadence, type EmailCadence } from '@borntask/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { initialsOf, requireAuth } from '../context.js';
import { sendError, validation } from '../errors.js';

const prefSchema = z.object({
  event: z.enum(PROFILE_EMAIL_EVENTS),
  inApp: z.boolean(),
  emailCadence: z.enum(['instantly', 'digest', 'off']),
});

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Enter a display name.').max(80, 'Display name must be 80 characters or fewer.'),
  timeZone: z.string().trim().min(1).refine(isIanaTimeZone, 'Choose a valid time zone.'),
  digestMode: z.enum(['workdays', 'daily', 'off']),
  prefs: z.array(prefSchema).length(PROFILE_EMAIL_EVENTS.length),
});

function presentPrefs(
  rows: { event: string; channel: string; enabled: boolean; emailCadence: string | null }[],
  emailPerTask: boolean,
): { event: string; inApp: boolean; emailCadence: EmailCadence }[] {
  return PROFILE_EMAIL_EVENTS.map((event) => {
    const inApp = rows.find((row) => row.event === event && row.channel === 'in_app');
    const email = rows.find((row) => row.event === event && row.channel === 'email');
    return {
      event,
      inApp: inApp ? inApp.enabled : true,
      emailCadence: resolveEmailCadence({
        event,
        stored: email?.emailCadence,
        emailEnabled: email?.enabled,
        emailPerTask,
      }),
    };
  });
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/profile', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const rows = await auth.db.notificationPreference.findMany({ where: { userId: auth.userId } });
      return {
        name: user.name,
        email: user.email,
        timeZone: isIanaTimeZone(user.timeZone) ? user.timeZone : 'Europe/Malta',
        digestMode: user.digestMode,
        prefs: presentPrefs(rows, user.emailPerTask),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch('/me/profile', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const body = saveSchema.parse(req.body);
      const seen = new Set(body.prefs.map((row) => row.event));
      if (seen.size !== PROFILE_EMAIL_EVENTS.length) throw validation('Every notification row is required.');
      const emailPerTask = body.prefs.some((row) => row.emailCadence === 'instantly');

      await prisma.user.update({
        where: { id: auth.userId },
        data: { name: body.name, timeZone: body.timeZone, digestMode: body.digestMode, emailPerTask },
      });

      for (const row of body.prefs) {
        await auth.db.notificationPreference.upsert({
          where: {
            userId_tenantId_event_channel: {
              userId: auth.userId,
              tenantId: auth.tenantId,
              event: row.event,
              channel: 'in_app',
            },
          },
          create: { tenantId: auth.tenantId, userId: auth.userId, event: row.event, channel: 'in_app', enabled: row.inApp },
          update: { enabled: row.inApp },
        });
        await auth.db.notificationPreference.upsert({
          where: {
            userId_tenantId_event_channel: {
              userId: auth.userId,
              tenantId: auth.tenantId,
              event: row.event,
              channel: 'email',
            },
          },
          create: {
            tenantId: auth.tenantId,
            userId: auth.userId,
            event: row.event,
            channel: 'email',
            enabled: row.emailCadence === 'instantly',
            emailCadence: row.emailCadence,
          },
          update: {
            enabled: row.emailCadence === 'instantly',
            emailCadence: row.emailCadence,
          },
        });
      }

      await auth.db.notificationPreference.upsert({
        where: {
          userId_tenantId_event_channel: {
            userId: auth.userId,
            tenantId: auth.tenantId,
            event: 'digest_ready',
            channel: 'email',
          },
        },
        create: {
          tenantId: auth.tenantId,
          userId: auth.userId,
          event: 'digest_ready',
          channel: 'email',
          enabled: body.digestMode !== 'off',
        },
        update: { enabled: body.digestMode !== 'off' },
      });

      const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const rows = await auth.db.notificationPreference.findMany({ where: { userId: auth.userId } });
      return {
        name: user.name,
        email: user.email,
        timeZone: user.timeZone,
        digestMode: user.digestMode,
        prefs: presentPrefs(rows, user.emailPerTask),
        initials: initialsOf(user.name),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
