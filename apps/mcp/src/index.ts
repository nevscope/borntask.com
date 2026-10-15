import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { TOOLS, callTool } from './tools.js';

const envFile = resolve(fileURLToPath(new URL('../../../.env', import.meta.url)));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const host = process.env.MCP_HOST ?? '0.0.0.0';
const port = Number(process.env.MCP_PORT ?? 3011);
const publicBase = (process.env.MCP_PUBLIC_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');
const webBase = (process.env.PUBLIC_URL ?? 'http://localhost:5174').replace(/\/$/, '');
const apiBase = (process.env.API_PUBLIC_URL ?? 'http://127.0.0.1:3010').replace(/\/$/, '');

type Rpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string; clientInfo?: { name?: string } };
};

function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token?.startsWith('bt_pat_')) return undefined;
  return token.trim();
}

function rpcError(id: Rpc['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleRpc(message: Rpc, token: string | undefined) {
  const method = message.method ?? '';
  if (method === 'notifications/initialized' || method.startsWith('notifications/')) return null;
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id ?? null,
      result: {
        protocolVersion: message.params?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'borntask', version: '0.1.0' },
      },
    };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id: message.id ?? null, result: {} };
  if (!token) return rpcError(message.id, -32001, 'Sign in with a personal token (bt_pat_) or complete the OAuth consent.');
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id: message.id ?? null, result: { tools: TOOLS } };
  }
  if (method === 'tools/call') {
    const name = message.params?.name ?? '';
    const args = message.params?.arguments ?? {};
    try {
      const result = await callTool(token, name, args);
      return { jsonrpc: '2.0', id: message.id ?? null, result };
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Tool failed.';
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: { content: [{ type: 'text', text: messageText }], isError: true },
      };
    }
  }
  return rpcError(message.id, -32601, `Method not found: ${method}`);
}

async function main() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'borntask-mcp', tools: TOOLS.map((tool) => tool.name) }));

  app.get('/.well-known/oauth-protected-resource', async () => ({
    resource: `${publicBase}/mcp`,
    authorization_servers: [publicBase],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read', 'read_write'],
  }));

  app.get('/.well-known/oauth-authorization-server', async () => ({
    issuer: publicBase,
    authorization_endpoint: `${publicBase}/oauth/authorize`,
    token_endpoint: `${publicBase}/oauth/token`,
    registration_endpoint: `${publicBase}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['read', 'read_write'],
    token_endpoint_auth_methods_supported: ['none'],
  }));

  app.get('/oauth/authorize', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const url = new URL('/oauth/consent', webBase);
    const clientName = q.client_name || q.client_id || 'Claude';
    url.searchParams.set('client_name', clientName);
    if (q.redirect_uri) url.searchParams.set('redirect_uri', q.redirect_uri);
    if (q.state) url.searchParams.set('state', q.state);
    if (q.code_challenge) url.searchParams.set('code_challenge', q.code_challenge);
    if (q.scope === 'read' || q.scope === 'read_write') url.searchParams.set('scope', q.scope);
    return reply.redirect(url.toString());
  });

  app.post('/oauth/register', async (req) => {
    const body = (req.body ?? {}) as { client_name?: string; redirect_uris?: string[] };
    const name = body.client_name?.trim() || 'MCP client';
    return {
      client_id: name,
      client_name: name,
      redirect_uris: body.redirect_uris ?? [],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  });

  app.post('/oauth/token', async (req, reply) => {
    const res = await fetch(`${apiBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    });
    const text = await res.text();
    return reply.code(res.status).type('application/json').send(text);
  });

  app.post('/mcp', async (req, reply) => {
    const token = bearer(req.headers.authorization);
    const body = req.body;
    if (Array.isArray(body)) {
      const out = [];
      for (const item of body as Rpc[]) {
        const result = await handleRpc(item, token);
        if (result) out.push(result);
      }
      return out;
    }
    const result = await handleRpc((body ?? {}) as Rpc, token);
    if (!result) return reply.code(202).send();
    return result;
  });

  app.get('/mcp', async (_req, reply) => {
    return reply.code(405).send({ error: 'method_not_allowed', message: 'Send JSON-RPC POST requests to this URL.' });
  });

  await app.listen({ host, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
