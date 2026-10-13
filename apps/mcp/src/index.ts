import Fastify from 'fastify';

const host = process.env.MCP_HOST ?? '0.0.0.0';
const port = Number(process.env.MCP_PORT ?? 3011);

async function main() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'borntask-mcp', tools: [] }));

  app.all('/mcp', async (_req, reply) => {
    return reply.code(501).send({
      error: 'not_implemented',
      message: 'MCP tools ship in Stage 10. This process is a stub.',
    });
  });

  await app.listen({ host, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
