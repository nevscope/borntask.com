import './loadEnv.js';
import './sessionTypes.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';
import multipart from '@fastify/multipart';
import { prisma } from './db.js';
import { config } from './env.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { inviteRoutes } from './routes/invites.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { workflowRoutes } from './routes/workflow.js';
import { searchRoutes } from './routes/search.js';
import { adminRoutes } from './routes/admin.js';
import { importRoutes } from './routes/import.js';
import { notificationRoutes } from './routes/notifications.js';
import { profileRoutes } from './routes/profile.js';
import { chatRoutes } from './routes/chat.js';
import { chatAppRoutes } from './routes/chatApp.js';
import { tokenRoutes } from './routes/tokens.js';
import { oauthRoutes } from './routes/oauth.js';
import { githubRoutes } from './routes/github.js';
import { automationRoutes } from './routes/automations.js';
import { streamRoutes } from './routes/stream.js';
import { inboundMailRoutes } from './routes/inboundMail.js';
import { timesheetRoutes } from './routes/timesheets.js';
import { holidayRoutes } from './routes/holidays.js';
import { reportRoutes } from './routes/reports.js';
import { allowedRequestOrigin } from './lib/workspaceHost.js';

async function main() {
  const app = Fastify({ logger: true, trustProxy: true });

  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, allowedRequestOrigin(origin));
    },
    credentials: true,
  });
  await app.register(cookie);
  await app.register(secureSession, {
    key: Buffer.from(config.sessionSecret.padEnd(32, '0').slice(0, 32)),
    expiry: config.sessionMaxAgeSeconds,
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      domain: config.sessionCookieDomain,
      maxAge: config.sessionMaxAgeSeconds,
    },
  });
  app.addHook('onRequest', async (req) => {
    if (req.session.get('userId')) req.session.touch();
  });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(inviteRoutes);
  await app.register(workspaceRoutes);
  await app.register(projectRoutes);
  await app.register(taskRoutes);
  await app.register(workflowRoutes);
  await app.register(searchRoutes);
  await app.register(adminRoutes);
  await app.register(importRoutes);
  await app.register(notificationRoutes);
  await app.register(profileRoutes);
  await app.register(chatRoutes);
  await app.register(chatAppRoutes);
  await app.register(tokenRoutes);
  await app.register(oauthRoutes);
  await app.register(githubRoutes);
  await app.register(automationRoutes);
  await app.register(streamRoutes);
  await app.register(inboundMailRoutes);
  await app.register(timesheetRoutes);
  await app.register(holidayRoutes);
  await app.register(reportRoutes);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
