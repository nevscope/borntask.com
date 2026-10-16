import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../context.js';
import { sendError } from '../errors.js';
import { subscribeLive, type LiveTaskEvent } from '../lib/live.js';

const HEARTBEAT_MS = 15_000;

function writeSse(raw: NodeJS.WritableStream, chunk: string) {
  raw.write(chunk);
}

export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stream', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const raw = reply.raw;
      raw.setTimeout(0);
      reply.hijack();
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      writeSse(raw, ': connected\n\n');

      const send = (event: LiveTaskEvent) => {
        writeSse(raw, `event: task\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const stop = subscribeLive(auth.tenantId, send);
      const beat = setInterval(() => {
        writeSse(raw, ': heartbeat\n\n');
      }, HEARTBEAT_MS);

      const close = () => {
        clearInterval(beat);
        void stop();
      };
      req.raw.on('close', close);
      req.raw.on('end', close);
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
