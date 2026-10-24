import { Prisma } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import { ZodError, type ZodIssue } from 'zod';

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

function isIssueDump(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('[') && trimmed.includes('"code"');
}

function parseIssueDump(text: string): ZodIssue[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || !parsed[0] || typeof parsed[0] !== 'object') return null;
    const first = parsed[0] as { code?: unknown };
    if (typeof first.code !== 'string') return null;
    return parsed as ZodIssue[];
  } catch {
    return null;
  }
}

function issuesOf(err: unknown): ZodIssue[] | null {
  if (err instanceof ZodError) return err.issues;
  if (err && typeof err === 'object' && Array.isArray((err as { issues?: unknown }).issues)) {
    const issues = (err as { issues: ZodIssue[] }).issues;
    if (issues[0] && typeof issues[0].code === 'string') return issues;
  }
  if (err instanceof Error && isIssueDump(err.message)) return parseIssueDump(err.message);
  return null;
}

export function humanizeZodIssues(issues: ZodIssue[]): string {
  const issue = issues[0];
  if (!issue) return 'Check the fields and try again.';
  if (issue.message && !isIssueDump(issue.message) && !issue.message.startsWith('String must contain')) {
    return issue.message;
  }
  if (issue.code === 'too_big' && issue.type === 'string') {
    const maximum = 'maximum' in issue ? issue.maximum : 80;
    const field = issue.path[0];
    if (field === 'name') return `Name must be ${maximum} characters or fewer.`;
    return `That must be ${maximum} characters or fewer.`;
  }
  if (issue.code === 'too_small' && issue.type === 'string') {
    return issue.path[0] === 'name' ? 'Enter a name.' : 'This field is required.';
  }
  return issue.message && !isIssueDump(issue.message) ? issue.message : 'Check the fields and try again.';
}

export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ApiError) {
    const message = isIssueDump(err.message)
      ? humanizeZodIssues(parseIssueDump(err.message) ?? [])
      : err.message;
    return reply.status(err.status).send({
      code: err.code,
      message,
      ...err.extra,
    });
  }
  const zodIssues = issuesOf(err);
  if (zodIssues) {
    return reply.status(400).send({
      code: 'VALIDATION',
      message: humanizeZodIssues(zodIssues),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2000') {
    return reply.status(400).send({
      code: 'VALIDATION',
      message: 'That field is too long. Shorten it and try again.',
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientValidationError) {
    return reply.status(500).send({
      code: 'SERVER',
      message: 'Something went wrong. Try again.',
    });
  }
  const message = err instanceof Error ? err.message : 'Server error';
  return reply.status(500).send({ code: 'SERVER', message: isIssueDump(message) ? humanizeZodIssues(parseIssueDump(message) ?? []) : message });
}

export const unauthorized = (message = 'Sign in to continue.') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You cannot do that.') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message);
export const validation = (message: string) => new ApiError(400, 'VALIDATION', message);
