import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config, googleEnabled, microsoftEnabled } from '../env.js';
import { clearSession, initialsOf, requireUser, sessionTenantId, sessionUserId, setSession } from '../context.js';
import { sendError, unauthorized, validation } from '../errors.js';
import { finishLogin } from '../lib/finishLogin.js';
import { googleAuthUrl, googleProfile, microsoftAuthUrl, microsoftProfile } from '../lib/oauth.js';
import { hashToken } from '../lib/tokens.js';

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80),
  inviteToken: z.string().optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/providers', async () => ({
    google: googleEnabled(),
    microsoft: microsoftEnabled(),
    devLogin: config.allowDevLogin,
  }));

  app.get('/auth/google', async (req, reply) => {
    if (!googleEnabled()) return reply.redirect(`${config.publicUrl}/sign-in?error=google-unconfigured`);
    const state = randomBytes(16).toString('hex');
    req.session.set('oauthState', state);
    const invite = typeof req.query === 'object' && req.query && 'invite' in req.query ? String((req.query as { invite?: string }).invite ?? '') : '';
    if (invite) req.session.set('inviteToken', invite);
    return reply.redirect(googleAuthUrl(state));
  });

  app.get('/auth/google/callback', async (req, reply) => {
    try {
      const q = req.query as { code?: string; state?: string };
      if (!q.code || q.state !== req.session.get('oauthState')) throw validation('Invalid Google callback.');
      req.session.set('oauthState', undefined);
      const profile = await googleProfile(q.code);
      return finishLogin(req, reply, { ...profile, provider: 'google' });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/auth/microsoft', async (req, reply) => {
    if (!microsoftEnabled()) return reply.redirect(`${config.publicUrl}/sign-in?error=microsoft-unconfigured`);
    const state = randomBytes(16).toString('hex');
    req.session.set('oauthState', state);
    const invite = typeof req.query === 'object' && req.query && 'invite' in req.query ? String((req.query as { invite?: string }).invite ?? '') : '';
    if (invite) req.session.set('inviteToken', invite);
    return reply.redirect(microsoftAuthUrl(state));
  });

  app.get('/auth/microsoft/callback', async (req, reply) => {
    try {
      const q = req.query as { code?: string; state?: string };
      if (!q.code || q.state !== req.session.get('oauthState')) throw validation('Invalid Microsoft callback.');
      req.session.set('oauthState', undefined);
      const profile = await microsoftProfile(q.code);
      return finishLogin(req, reply, { ...profile, provider: 'microsoft' });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/auth/dev-login', async (req, reply) => {
    try {
      if (!config.allowDevLogin) throw unauthorized();
      const input = devLoginSchema.parse(req.body);
      if (input.inviteToken) req.session.set('inviteToken', input.inviteToken);
      return finishLogin(req, reply, { email: input.email, name: input.name });
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
        where: { userId: user.id, isActive: true },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      });
      let tenantId = sessionTenantId(req);
      if (!tenantId || !memberships.some((m) => m.tenantId === tenantId)) {
        tenantId = memberships[0]?.tenantId;
        if (tenantId) setSession(req, reply, { userId: user.id, tenantId });
      }
      const current = memberships.find((m) => m.tenantId === tenantId);
      return {
        user: { id: user.id, name: user.name, email: user.email, initials: initialsOf(user.name) },
        workspace: current
          ? { id: current.tenant.id, name: current.tenant.name, slug: current.tenant.slug }
          : { id: '', name: '', slug: '' },
        workspaceRole: current?.tenantRole ?? 'member',
        workspaces: memberships.map((m) => ({
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          role: m.tenantRole,
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
      setSession(req, reply, { userId: user.id, tenantId: body.workspaceId });
      return { ok: true };
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
