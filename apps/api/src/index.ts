import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { prisma } from './db.js';

const host = process.env.API_HOST ?? '0.0.0.0';
const port = Number(process.env.API_PORT ?? 3010);

async function main() {
  const app = Fastify({ logger: true });

  const webOrigin = process.env.PUBLIC_URL ?? 'http://localhost:5174';
  await app.register(cors, {
    origin: [webOrigin, 'http://localhost:5174', 'http://127.0.0.1:5174'],
    credentials: true,
  });

  await app.register(healthRoutes);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.listen({ host, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
