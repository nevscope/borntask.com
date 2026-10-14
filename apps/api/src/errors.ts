import type { FastifyReply } from 'fastify';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ApiError) {
    return reply.status(err.status).send({
      code: err.code,
      message: err.message,
      ...err.extra,
    });
  }
  const message = err instanceof Error ? err.message : 'Server error';
  return reply.status(500).send({ code: 'SERVER', message });
}

export const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
export const forbidden = (message = 'You cannot do that.') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message);
export const validation = (message: string) => new ApiError(400, 'VALIDATION', message);
