import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config, googleEnabled, microsoftEnabled } from '../env.js';
import { clearSession, initialsOf, requireUser, sessionTenantId, sessionUserId, setSession } from '../context.js';
import { ApiError, sendError, unauthorized, validation } from '../errors.js';
import { finishLogin } from '../lib/finishLogin.js';
import { nameFromEmail, normalizeEmail, startChallenge, verifyCode, verifyLink } from '../lib/emailLogin.js';
import { googleAuthUrl, googleProfile, microsoftAuthUrl, microsoftProfile } from '../lib/oauth.js';
import { createOauthState, parseOauthState } from '../lib/oauthState.js';
import { clientIp, enforceRateLimit } from '../lib/rateLimit.js';
import { sendLoginCodeEmail } from '../lib/sendLoginCode.js';
import { hashToken } from '../lib/tokens.js';
import { hubOrigin, loginAbsoluteUrl, loginDestination, originForSlug, requestWebOrigin, workspaceSlugFromRequest } from '../lib/workspaceHost.js';
import { isAllowedWebOrigin } from '@borntask/shared';

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80),
  inviteToken: z.string().optional(),
  next: z.string().optional(),
});

const emailStartSchema = z.object({
  email: z.string().min(3).max(320),
  next: z.string().max(2000).optional(),
  invite: z.string().max(200).optional(),
});

const emailVerifySchema = z.object({
  email: z.string().max(320).optional(),
  code: z.string().max(20).optional(),
  token: z.string().max(128).optional(),
});

function inAppNext(raw: string | undefined): string | undefined {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/sign-in')) return undefined;
  return raw;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/providers', async () => ({
    google: googleEnabled(),
    microsoft: microsoftEnabled(),
    email: true,
    devLogin: config.allowDevLogin,
  }));

  app.get('/auth/host', async (req) => {
    const slug = workspaceSlugFromRequest(req);
    if (!slug) {
      return { kind: 'app' as const, slug: null, exists: true, name: null, url: hubOrigin() };
    }
    const workspace = await prisma.workspace.findFirst({
      where: { slug, deletedAt: null },
      select: { name: true, slug: true },
    });
    return {
      kind: 'workspace' as const,
      slug,
      exists: Boolean(workspace),
      name: workspace?.name ?? null,
      url: originForSlug(slug),
    };
  });

  app.post('/auth/email/start', async (req, reply) => {
    try {
      const input = emailStartSchema.parse(req.body);
      const email = normalizeEmail(input.email);
      if (!email) throw validation('Enter a valid email address.');
      await enforceRateLimit(`auth-email-ip:${clientIp(req)}`, 10, 15 * 60);
      await enforceRateLimit(`auth-email-to:${email}`, 5, 60 * 60);
      const { code, linkToken } = await startChallenge(email, {
        nextPath: inAppNext(input.next) ?? null,
        inviteToken: input.invite ?? null,
      });
      try {
        const origin = requestWebOrigin(req);
        const linkOrigin = isAllowedWebOrigin(origin, { publicUrl: config.publicUrl, baseDomain: config.appBaseDomain })
          ? origin
          : undefined;
        await sendLoginCodeEmail(email, code, linkToken, linkOrigin);
      } catch {
        throw new ApiError(503, 'MAIL', 'We could not send the email just now. Try again in a minute.');
      }
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/auth/email/verify', async (req, reply) => {
    try {
      await enforceRateLimit(`auth-email-verify:${clientIp(req)}`, 30, 15 * 60);
      const input = emailVerifySchema.parse(req.body);
      const challenge = input.token
        ? await verifyLink(input.token)
        : await (async () => {
            const email = normalizeEmail(input.email ?? '');
            return email ? verifyCode(email, input.code ?? '') : null;
          })();
      if (!challenge) throw validation('That code did not work. Check the latest email, or send a new code.');
      if (challenge.inviteToken) req.session.set('inviteToken', challenge.inviteToken);
      const redirect = await finishLogin(req, reply, {
        email: challenge.email,
        name: nameFromEmail(challenge.email),
        provider: 'email',
        providerId: challenge.email,
      });
      const next = inAppNext(challenge.nextPath ?? undefined);
      const path = redirect.path === '/' && next ? next : redirect.path;
      return { ok: true, redirect: loginDestination(req, path, redirect.tenantSlug) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/auth/google', async (req, reply) => {
    if (!googleEnabled()) return reply.redirect(`${config.publicUrl}/sign-in?error=google-unconfigured`);
    const invite = typeof req.query === 'object' && req.query && 'invite' in req.query ? String((req.query as { invite?: string }).invite ?? '') : '';
    return reply.redirect(googleAuthUrl(createOauthState(invite, workspaceSlugFromRequest(req) ?? '')));
  });

  app.get('/auth/google/callback', async (req, reply) => {
    try {
      const q = req.query as { code?: string; state?: string };
      const parsed = parseOauthState(q.state);
      if (!q.code || !parsed) throw validation('Invalid Google callback.');
      if (parsed.invite) req.session.set('inviteToken', parsed.invite);
      const profile = await googleProfile(q.code);
      const next = await finishLogin(req, reply, { ...profile, provider: 'google' }, { preferredSlug: parsed.returnSlug });
      return reply.redirect(loginAbsoluteUrl(req, next.path, next.tenantSlug));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/auth/microsoft', async (req, reply) => {
    if (!microsoftEnabled()) return reply.redirect(`${config.publicUrl}/sign-in?error=microsoft-unconfigured`);
    const invite = typeof req.query === 'object' && req.query && 'invite' in req.query ? String((req.query as { invite?: string }).invite ?? '') : '';
    return reply.redirect(microsoftAuthUrl(createOauthState(invite, workspaceSlugFromRequest(req) ?? '')));
  });

  app.get('/auth/microsoft/callback', async (req, reply) => {
    try {
      const q = req.query as { code?: string; state?: string };
      const parsed = parseOauthState(q.state);
      if (!q.code || !parsed) throw validation('Invalid Microsoft callback.');
      if (parsed.invite) req.session.set('inviteToken', parsed.invite);
      const profile = await microsoftProfile(q.code);
      const next = await finishLogin(req, reply, { ...profile, provider: 'microsoft' }, { preferredSlug: parsed.returnSlug });
      return reply.redirect(loginAbsoluteUrl(req, next.path, next.tenantSlug));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/auth/dev-login', async (req, reply) => {
    try {
      if (!config.allowDevLogin) throw unauthorized();
      const input = devLoginSchema.parse(req.body);
      if (input.inviteToken) req.session.set('inviteToken', input.inviteToken);
      const redirect = await finishLogin(req, reply, { email: input.email, name: input.name });
      const next = input.next;
      const path =
        redirect.path === '/' &&
        next &&
        next.startsWith('/') &&
        !next.startsWith('//') &&
        !next.startsWith('/sign-in')
          ? next
          : redirect.path;
      return { redirect: loginDestination(req, path, redirect.tenantSlug) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/auth/logout', async (req, reply) => {
    clearSession(req);
    return reply.send({ ok: true });
  });

  app.get('/me', async (req, reply) => {
    try {
      const userId = sessionUserId(req);
      if (!userId) throw unauthorized();
      const user = await requireUser(req);
      const memberships = await prisma.tenantMember.findMany({
        where: { userId: user.id, isActive: true, tenant: { deletedAt: null } },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      });
      const hostSlug = workspaceSlugFromRequest(req);
      const hostWorkspace = hostSlug
        ? await prisma.workspace.findFirst({ where: { slug: hostSlug, deletedAt: null }, select: { id: true, name: true, slug: true } })
        : null;
      const hostMember = hostWorkspace ? memberships.find((m) => m.tenantId === hostWorkspace.id) : undefined;

      let tenantId = hostMember?.tenantId ?? sessionTenantId(req);
      if (!hostSlug && (!tenantId || !memberships.some((m) => m.tenantId === tenantId))) {
        tenantId = memberships[0]?.tenantId;
        if (tenantId) setSession(req, reply, { userId: user.id, tenantId });
      }
      if (hostMember) setSession(req, reply, { userId: user.id, tenantId: hostMember.tenantId });
      const current = memberships.find((m) => m.tenantId === tenantId);
      if (!current && !hostSlug) setSession(req, reply, { userId: user.id });
      return {
        user: { id: user.id, name: user.name, email: user.email, initials: initialsOf(user.name) },
        workspace: current
          ? { id: current.tenant.id, name: current.tenant.name, slug: current.tenant.slug, logo: Boolean(current.tenant.logo) }
          : { id: '', name: '', slug: '', logo: false },
        workspaceRole: current?.tenantRole ?? 'member',
        host: hostSlug
          ? {
              kind: 'workspace' as const,
              slug: hostSlug,
              exists: Boolean(hostWorkspace),
              allowed: Boolean(hostMember),
              name: hostWorkspace?.name ?? null,
            }
          : { kind: 'app' as const, slug: null, exists: true, allowed: true, name: null },
        workspaces: memberships.map((m) => ({
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          role: m.tenantRole,
          logo: Boolean(m.tenant.logo),
          url: originForSlug(m.tenant.slug),
        })),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/me/workspace', async (req, reply) => {
    try {
      const user = await requireUser(req);
      const body = z.object({ workspaceId: z.string().min(1) }).parse(req.body);
      const membership = await prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: body.workspaceId, userId: user.id } },
      });
      if (!membership?.isActive) throw unauthorized();
      const workspace = await prisma.workspace.findUnique({ where: { id: body.workspaceId } });
      if (!workspace || workspace.deletedAt) throw unauthorized();
      setSession(req, reply, { userId: user.id, tenantId: body.workspaceId });
      return { ok: true, url: `${originForSlug(workspace.slug)}/` };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/invites/:token', async (req, reply) => {
    try {
      const token = (req.params as { token: string }).token;
      const invite = await prisma.invitation.findFirst({
        where: { tokenHash: hashToken(token) },
        include: { tenant: true, invitedBy: true, project: true },
      });
      if (!invite) throw validation('This invitation was not found.');
      const expired = Boolean(invite.revokedAt || invite.acceptedAt || invite.expiresAt.getTime() < Date.now());
      const signedIn = sessionUserId(req)
        ? await prisma.user.findUnique({ where: { id: sessionUserId(req)! } })
        : null;
      return {
        email: invite.email,
        workspaceName: invite.tenant.name,
        workspaceSlug: invite.tenant.slug,
        invitedBy: invite.invitedBy.name,
        tenantRole: invite.tenantRole,
        projectName: invite.project?.name ?? null,
        expired,
        accepted: Boolean(invite.acceptedAt),
        signedInEmail: signedIn?.email ?? null,
        wrongAccount: Boolean(signedIn && signedIn.email.toLowerCase() !== invite.email.toLowerCase()),
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
