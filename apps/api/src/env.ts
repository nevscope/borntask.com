export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing env ${name}`);
  return value;
}

export function boolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export const config = {
  host: env('API_HOST', '0.0.0.0'),
  port: Number(env('API_PORT', '3010')),
  publicUrl: env('PUBLIC_URL', 'http://localhost:5174'),
  apiPublicUrl: env('API_PUBLIC_URL', 'http://localhost:3010'),
  sessionSecret: env('SESSION_SECRET', 'borntask-local-dev-session-secret-change-me'),
  allowDevLogin: boolEnv('ALLOW_DEV_LOGIN', process.env.NODE_ENV !== 'production'),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
  blobRoot: env('BLOB_ROOT', '.data/blobs'),
};

export function googleEnabled(): boolean {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export function microsoftEnabled(): boolean {
  return Boolean(config.microsoftClientId && config.microsoftClientSecret);
}
