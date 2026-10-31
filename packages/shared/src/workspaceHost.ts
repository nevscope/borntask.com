/** Host labels that must never become a workspace web address. */
export const RESERVED_WORKSPACE_SLUGS = [
  'app',
  'www',
  'api',
  'mail',
  'notify',
  'mcp',
  'staging',
  'admin',
  'status',
  'support',
  'help',
  'docs',
  'blog',
  'cdn',
  'static',
  'assets',
  'auth',
  'oauth',
  'login',
  'signup',
  'invite',
  'ftp',
  'smtp',
  'ns',
  'ns1',
  'ns2',
  'test',
  'beta',
  'preview',
  'edge',
  'worker',
  'workers',
  'internal',
  'localhost',
  'borntask',
] as const;

const reserved = new Set<string>(RESERVED_WORKSPACE_SLUGS);

export function isReservedWorkspaceSlug(slug: string): boolean {
  return reserved.has(slug.trim().toLowerCase());
}

export function isWorkspaceSlugShape(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) && slug.length >= 2 && slug.length <= 40;
}

export function hostnameOf(hostHeader: string): string {
  const raw = hostHeader.split(',')[0]?.trim() ?? '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end > 0 ? raw.slice(1, end).toLowerCase() : raw.toLowerCase();
  }
  return raw.split(':')[0]?.toLowerCase() ?? '';
}

export function inferAppBaseDomain(publicUrl: string): string | null {
  let host: string;
  try {
    host = new URL(publicUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
  const labels = host.split('.');
  if (labels.length < 2) return null;
  if (labels.length === 2) return host;
  if (labels[0] === 'app' || labels[0] === 'www') return labels.slice(1).join('.');
  return labels.slice(1).join('.');
}

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function isAppHost(hostname: string, baseDomain: string | null): boolean {
  if (!hostname) return false;
  if (isLoopbackHost(hostname)) return true;
  if (!baseDomain) return false;
  return hostname === baseDomain || hostname === `app.${baseDomain}` || hostname === `www.${baseDomain}`;
}

/** First label of `{slug}.{baseDomain}`, or null on the hub / reserved / nested hosts. */
export function workspaceSlugFromHost(hostname: string, baseDomain: string | null): string | null {
  if (!baseDomain || !hostname) return null;
  const suffix = `.${baseDomain}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null;
  if (!isWorkspaceSlugShape(label) || isReservedWorkspaceSlug(label)) return null;
  return label;
}

export function workspaceOrigin(slug: string, opts: { protocol?: string; baseDomain: string }): string {
  const protocol = opts.protocol ?? 'https';
  return `${protocol}://${slug}.${opts.baseDomain}`;
}

export function appOrigin(opts: { protocol?: string; baseDomain: string | null; publicUrl: string }): string {
  if (!opts.baseDomain) return opts.publicUrl.replace(/\/$/, '');
  const protocol = opts.protocol ?? 'https';
  return `${protocol}://app.${opts.baseDomain}`;
}

export function isAllowedWebOrigin(origin: string, opts: { publicUrl: string; baseDomain: string | null }): boolean {
  if (!origin) return false;
  const allowed = new Set([
    opts.publicUrl.replace(/\/$/, ''),
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:4174',
    'http://127.0.0.1:4174',
  ]);
  if (allowed.has(origin.replace(/\/$/, ''))) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (isLoopbackHost(host) && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return true;
  if (!opts.baseDomain || parsed.protocol !== 'https:') return false;
  if (isAppHost(host, opts.baseDomain)) return true;
  return workspaceSlugFromHost(host, opts.baseDomain) !== null;
}
