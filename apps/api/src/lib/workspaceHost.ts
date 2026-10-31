import type { FastifyRequest } from 'fastify';
import {
  appOrigin,
  hostnameOf,
  isAllowedWebOrigin,
  workspaceOrigin,
  workspaceSlugFromHost,
} from '@borntask/shared';
import { config } from '../env.js';

export function requestHostname(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw = (typeof forwarded === 'string' ? forwarded : req.headers.host) ?? '';
  return hostnameOf(String(raw));
}

export function requestProtocol(req: FastifyRequest): string {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0]?.trim()) return proto.split(',')[0]!.trim();
  return config.appBaseDomain ? 'https' : 'http';
}

export function requestWebOrigin(req: FastifyRequest): string {
  const host = requestHostname(req);
  if (!host) return config.publicUrl.replace(/\/$/, '');
  return `${requestProtocol(req)}://${host}${portSuffix(req)}`;
}

function portSuffix(req: FastifyRequest): string {
  if (req.headers['x-forwarded-host'] || config.appBaseDomain) return '';
  const raw = String(req.headers.host ?? '');
  const port = raw.includes(':') && !raw.startsWith('[') ? raw.split(':')[1] : '';
  if (!port || port === '80' || port === '443') return '';
  if (isAllowedWebOrigin(`${requestProtocol(req)}://${requestHostname(req)}:${port}`, {
    publicUrl: config.publicUrl,
    baseDomain: config.appBaseDomain,
  })) {
    return '';
  }
  return '';
}

export function workspaceSlugFromRequest(req: FastifyRequest): string | null {
  return workspaceSlugFromHost(requestHostname(req), config.appBaseDomain);
}

export function hubOrigin(): string {
  return appOrigin({
    protocol: config.appBaseDomain ? 'https' : undefined,
    baseDomain: config.appBaseDomain,
    publicUrl: config.publicUrl,
  });
}

export function originForSlug(slug: string | null | undefined): string {
  if (slug && config.appBaseDomain) {
    return workspaceOrigin(slug, { protocol: 'https', baseDomain: config.appBaseDomain });
  }
  return hubOrigin();
}

export function loginAbsoluteUrl(req: FastifyRequest, path: string, tenantSlug: string | null): string {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  if (safePath.startsWith('/create-workspace') || safePath.startsWith('/invite/')) {
    return `${hubOrigin()}${safePath}`;
  }
  if (tenantSlug && config.appBaseDomain) {
    return `${originForSlug(tenantSlug)}${safePath}`;
  }
  const current = requestWebOrigin(req);
  if (isAllowedWebOrigin(current, { publicUrl: config.publicUrl, baseDomain: config.appBaseDomain })) {
    return `${current}${safePath}`;
  }
  return `${hubOrigin()}${safePath}`;
}

export function loginDestination(req: FastifyRequest, path: string, tenantSlug: string | null): string {
  const absolute = loginAbsoluteUrl(req, path, tenantSlug);
  const current = requestWebOrigin(req);
  if (absolute.startsWith(current)) {
    return absolute.slice(current.length) || '/';
  }
  return absolute;
}

export function allowedRequestOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return isAllowedWebOrigin(origin, { publicUrl: config.publicUrl, baseDomain: config.appBaseDomain });
}
