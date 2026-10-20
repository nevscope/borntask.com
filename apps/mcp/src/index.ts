import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { TOOLS, callTool } from './tools.js';

const envFile = resolve(fileURLToPath(new URL('../../../.env', import.meta.url)));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const host = process.env.MCP_HOST ?? '0.0.0.0';
const port = Number(process.env.MCP_PORT ?? 3011);
const publicBase = (process.env.MCP_PUBLIC_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '').replace(/\/mcp$/i, '');
const webBase = (process.env.PUBLIC_URL ?? 'http://localhost:5174').replace(/\/$/, '');
const apiBase = (process.env.API_PUBLIC_URL ?? 'http://127.0.0.1:3010').replace(/\/$/, '');
const resourceUrl = `${publicBase}/mcp`;
const resourceMetadata = `${publicBase}/.well-known/oauth-protected-resource`;

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

function protectedResource() {
  return {
    resource: resourceUrl,
    authorization_servers: [publicBase],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read', 'read_write'],
  };
}

function authorizationServer() {
  return {
    issuer: publicBase,
    authorization_endpoint: `${publicBase}/oauth/authorize`,
    token_endpoint: `${publicBase}/oauth/token`,
    registration_endpoint: `${publicBase}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['read', 'read_write'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

function unauthorised(id: Rpc['id']) {
  return rpcError(id, -32001, 'Sign in with a personal token (bt_pat_) or complete the OAuth consent.');
}

function handleRpc(message: Rpc, token: string) {
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
  return { method, token, id: message.id, params: message.params };
}

async function callNamedTool(token: string, name: string, args: Record<string, unknown>) {
  try {
    return await callTool(token, name, args);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : 'Tool failed.';
    return { content: [{ type: 'text', text: messageText }], isError: true };
  }
}

async function main() {
  const app = Fastify({ logger: true });

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const params = new URLSearchParams(String(body));
      const out: Record<string, string> = {};
      params.forEach((value, key) => {
        out[key] = value;
      });
      done(null, out);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version');
    reply.header('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version');
    if (req.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  app.get('/health', async () => ({ status: 'ok', service: 'borntask-mcp', tools: TOOLS.map((tool) => tool.name) }));

  const sendProtected = async () => protectedResource();
  const sendAuthorization = async () => authorizationServer();
  app.get('/.well-known/oauth-protected-resource', sendProtected);
  app.get('/.well-known/oauth-protected-resource/mcp', sendProtected);
  app.get('/mcp/.well-known/oauth-protected-resource', sendProtected);
  app.get('/.well-known/oauth-authorization-server', sendAuthorization);
  app.get('/.well-known/oauth-authorization-server/mcp', sendAuthorization);

  app.get('/oauth/authorize', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const url = new URL('/oauth/consent', webBase);
    const clientName = (q.client_name || q.client_id || 'Claude').trim() || 'Claude';
    url.searchParams.set('client_name', clientName);
    if (q.redirect_uri) url.searchParams.set('redirect_uri', q.redirect_uri);
    if (q.state) url.searchParams.set('state', q.state);
    if (q.code_challenge) url.searchParams.set('code_challenge', q.code_challenge);
    const scope = q.scope?.split(/[ +]/).find((part) => part === 'read' || part === 'read_write');
    if (scope) url.searchParams.set('scope', scope);
    return reply.redirect(url.toString());
  });

  app.post('/oauth/register', async (req, reply) => {
    const body = (req.body ?? {}) as { client_name?: string; client_id?: string; redirect_uris?: string[] };
    const name = body.client_name?.trim() || body.client_id?.trim() || 'MCP client';
    return reply.code(201).send({
      client_id: name,
      client_name: name,
      redirect_uris: body.redirect_uris ?? [],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
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

  function challenge(reply: { header: (name: string, value: string) => unknown }) {
    reply.header('WWW-Authenticate', `Bearer realm="BornTask", resource_metadata="${resourceMetadata}"`);
  }

  app.post('/mcp', async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) {
      challenge(reply);
      return reply.code(401).send(unauthorised(((req.body ?? {}) as Rpc).id ?? null));
    }
    const body = req.body;
    const items = Array.isArray(body) ? (body as Rpc[]) : [(body ?? {}) as Rpc];
    const out = [];
    for (const item of items) {
      const handled = handleRpc(item, token);
      if (handled === null) continue;
      if ('method' in handled && handled.method === 'tools/list') {
        out.push({ jsonrpc: '2.0', id: handled.id ?? null, result: { tools: TOOLS } });
        continue;
      }
      if ('method' in handled && handled.method === 'tools/call' && handled.token) {
        const name = handled.params?.name ?? '';
        const args = handled.params?.arguments ?? {};
        const result = await callNamedTool(handled.token, name, args);
        out.push({ jsonrpc: '2.0', id: handled.id ?? null, result });
        continue;
      }
      if ('jsonrpc' in handled) out.push(handled);
    }
    if (!Array.isArray(body)) {
      if (out.length === 0) return reply.code(202).send();
      return out[0];
    }
    return out;
  });

  app.get('/mcp', async (_req, reply) => {
    challenge(reply);
    return reply.code(401).send(unauthorised(null));
  });

  await app.listen({ host, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
