import { config, googleEnabled, microsoftEnabled } from '../env.js';

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: `${config.apiPublicUrl}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function microsoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.microsoftClientId,
    redirect_uri: `${config.apiPublicUrl}/auth/microsoft/callback`,
    response_type: 'code',
    scope: 'openid email profile User.Read',
    state,
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function googleProfile(code: string): Promise<{ email: string; name: string; providerId: string }> {
  const body = new URLSearchParams({
    code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: `${config.apiPublicUrl}/auth/google/callback`,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) throw new Error('Google token exchange failed');
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error('Google token missing');
  const meRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) throw new Error('Google profile failed');
  const me = (await meRes.json()) as { email?: string; name?: string; sub?: string };
  if (!me.email) throw new Error('Google email missing');
  return { email: me.email.toLowerCase(), name: me.name ?? me.email, providerId: me.sub ?? me.email };
}

export async function microsoftProfile(code: string): Promise<{ email: string; name: string; providerId: string }> {
  const body = new URLSearchParams({
    code,
    client_id: config.microsoftClientId,
    client_secret: config.microsoftClientSecret,
    redirect_uri: `${config.apiPublicUrl}/auth/microsoft/callback`,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) throw new Error('Microsoft token exchange failed');
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error('Microsoft token missing');
  const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) throw new Error('Microsoft profile failed');
  const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string; displayName?: string; id?: string };
  const email = (me.mail ?? me.userPrincipalName ?? '').toLowerCase();
  if (!email) throw new Error('Microsoft email missing');
  return { email, name: me.displayName ?? email, providerId: me.id ?? email };
}

export { googleEnabled, microsoftEnabled };
