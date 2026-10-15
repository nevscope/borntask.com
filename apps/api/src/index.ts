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
import { chatRoutes } from './routes/chat.js';
import { tokenRoutes } from './routes/tokens.js';
import { oauthRoutes } from './routes/oauth.js';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: [config.publicUrl, 'http://localhost:5174', 'http://127.0.0.1:5174'],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(secureSession, {
    key: Buffer.from(config.sessionSecret.padEnd(32, '0').slice(0, 32)),
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
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
  await app.register(chatRoutes);
  await app.register(tokenRoutes);
  await app.register(oauthRoutes);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
