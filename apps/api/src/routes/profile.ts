import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { initialsOf, requireAuth } from '../context.js';
import { sendError, validation } from '../errors.js';

export const PROFILE_EVENTS = [
  'assigned',
  'mention',
  'watched_stage',
  'watched_comment',
  'reported_deployed',
  'access_request',
  'digest_ready',
] as const;

const TIME_ZONES = ['Europe/Malta', 'Europe/London', 'UTC'] as const;
const CHANNELS = ['in_app', 'email'] as const;

const prefSchema = z.object({
  event: z.enum(PROFILE_EVENTS),
  inApp: z.boolean(),
  email: z.boolean(),
});

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Enter a display name.').max(80, 'Display name must be 80 characters or fewer.'),
  timeZone: z.enum(TIME_ZONES),
  digestMode: z.enum(['workdays', 'daily', 'off']),
  prefs: z.array(prefSchema).length(PROFILE_EVENTS.length),
});

function defaultInApp() {
  return true;
}

function defaultEmail(event: string) {
  return event !== 'digest_ready';
}

function presentPrefs(rows: { event: string; channel: string; enabled: boolean }[]) {
  return PROFILE_EVENTS.map((event) => {
    const inApp = rows.find((row) => row.event === event && row.channel === 'in_app');
    const email = rows.find((row) => row.event === event && row.channel === 'email');
    return {
      event,
      inApp: inApp ? inApp.enabled : defaultInApp(),
      email: email ? email.enabled : defaultEmail(event),
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
        timeZone: TIME_ZONES.includes(user.timeZone as (typeof TIME_ZONES)[number]) ? user.timeZone : 'Europe/Malta',
        digestMode: user.digestMode,
        prefs: presentPrefs(rows),
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
      if (seen.size !== PROFILE_EVENTS.length) throw validation('Every notification row is required.');

      await prisma.user.update({
        where: { id: auth.userId },
        data: { name: body.name, timeZone: body.timeZone, digestMode: body.digestMode },
      });

      for (const row of body.prefs) {
        for (const channel of CHANNELS) {
          const enabled = channel === 'in_app' ? row.inApp : row.email;
          await auth.db.notificationPreference.upsert({
            where: {
              userId_tenantId_event_channel: {
                userId: auth.userId,
                tenantId: auth.tenantId,
                event: row.event,
                channel,
              },
            },
            create: { tenantId: auth.tenantId, userId: auth.userId, event: row.event, channel, enabled },
            update: { enabled },
          });
        }
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const rows = await auth.db.notificationPreference.findMany({ where: { userId: auth.userId } });
      return {
        name: user.name,
        email: user.email,
        timeZone: user.timeZone,
        digestMode: user.digestMode,
        prefs: presentPrefs(rows),
        initials: initialsOf(user.name),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
