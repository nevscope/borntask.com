import { Readable } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import { Webhooks } from '@octokit/webhooks';
import { z } from 'zod';
import {
  defaultGithubRules,
  parseGithubRules,
  suggestedBranchName,
} from '@borntask/shared';
import { prisma, createTenantClient } from '../db.js';
import { requireAuth, type Authed } from '../context.js';
import { config, githubAppEnabled } from '../env.js';
import { sendError, unauthorized, validation } from '../errors.js';
import { githubInstallUrl, githubManageUrl, installationAccountLogin, listInstallationRepos } from '../lib/githubApp.js';
import { createGithubState, parseGithubState } from '../lib/githubState.js';
import { runGitHubWebhookJob } from '../lib/githubWebhookJob.js';
import { getGithubQueue, JOB } from '../lib/queue.js';
import { assertCanManageOpenProject, requireOpenProject, requireOpenProjectWrite } from '../lib/projectAccess.js';

async function projectFor(auth: Authed, key: string) {
  return requireOpenProject(auth, key);
}

async function assertCanManage(auth: Authed, project: { id: string; leadId: string | null }) {
  await assertCanManageOpenProject(auth, project, 'Only a project lead or workspace admin can change GitHub settings.');
}

const rulesSchema = z.object({
  branchCreated: z.boolean(),
  prOpened: z.boolean(),
  draftPr: z.boolean(),
  prMerged: z.boolean(),
  prClosedUnmerged: z.boolean(),
});

export const githubRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preParsing', async (req, _reply, payload) => {
    if (!req.url.startsWith('/github/webhook')) return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    (req as FastifyRequestRaw).rawBody = raw.toString('utf8');
    return Readable.from(raw);
  });

  app.post('/github/webhook', async (req, reply) => {
    try {
      if (!config.githubWebhookSecret) throw unauthorized('GitHub webhook secret is not configured.');
      const raw = (req as FastifyRequestRaw).rawBody ?? JSON.stringify(req.body ?? {});
      const signature = String(req.headers['x-hub-signature-256'] ?? '');
      const webhooks = new Webhooks({ secret: config.githubWebhookSecret });
      const ok = await webhooks.verify(raw, signature);
      if (!ok) throw unauthorized('Invalid GitHub signature.');
      const event = String(req.headers['x-github-event'] ?? '');
      const payload = typeof req.body === 'object' && req.body ? (req.body as Record<string, unknown>) : JSON.parse(raw);
      await getGithubQueue().add(JOB.githubWebhook, { event, payload });
      return { ok: true };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/internal/github-webhook-job', async (req, reply) => {
    try {
      if (req.headers['x-borntask-job'] !== config.sessionSecret) throw unauthorized();
      const body = z.object({ event: z.string(), payload: z.record(z.unknown()) }).parse(req.body);
      return await runGitHubWebhookJob(body);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/github/install', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const projectKey = String((req.query as { project?: string }).project ?? '');
      if (!projectKey) throw validation('Choose a project first.');
      const project = await requireOpenProjectWrite(auth, projectKey);
      await assertCanManage(auth, project);
      if (!githubAppEnabled()) throw validation('The GitHub App is not configured on this server yet.');
      const state = createGithubState({ tenantId: auth.tenantId, projectKey, userId: auth.userId });
      return reply.redirect(githubInstallUrl(state));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/github/callback', async (req, reply) => {
    try {
      const query = req.query as { installation_id?: string; setup_action?: string; state?: string };
      const parsed = parseGithubState(query.state);
      if (!parsed) throw unauthorized('This GitHub install link has expired. Start again from the project.');
      const installationId = String(query.installation_id ?? '');
      if (!installationId) throw validation('GitHub did not return an installation.');
      const db = createTenantClient(parsed.tenantId);
      const account = await installationAccountLogin(installationId);
      await prisma.gitHubInstallation.upsert({
        where: { installationId },
        create: {
          tenantId: parsed.tenantId,
          installationId,
          accountLogin: account,
          installedByUserId: parsed.userId,
        },
        update: { accountLogin: account, installedByUserId: parsed.userId },
      });
      void db;
      const dest = `${config.publicUrl.replace(/\/$/, '')}/p/${encodeURIComponent(parsed.projectKey)}/settings/github`;
      return reply.redirect(dest);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/projects/:key/github', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const project = await projectFor(auth, key);
      return await githubPayload(auth, project, key);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/projects/:key/github', async (req, reply) => {
    try {
      const auth = await requireAuth(req);
      const key = (req.params as { key: string }).key;
      const body = z.object({
        branchTemplate: z.string().trim().min(3).max(80).optional(),
        rules: rulesSchema.optional(),
        addRepo: z.string().optional(),
        removeRepo: z.string().optional(),
      }).parse(req.body);
      const project = await requireOpenProjectWrite(auth, key);
      await assertCanManage(auth, project);
      const install = await auth.db.gitHubInstallation.findFirst();
      if (!install) throw validation('Install the GitHub App first.');
      if (body.addRepo) {
        const available = await listInstallationRepos(install.installationId).catch(() => [] as { fullName: string; defaultBranch: string }[]);
        const match = available.find((r) => r.fullName === body.addRepo) ?? {
          fullName: body.addRepo,
          defaultBranch: 'main',
        };
        await auth.db.projectRepo.upsert({
          where: { projectId_repoFullName: { projectId: project.id, repoFullName: match.fullName } },
          create: {
            tenantId: auth.tenantId,
            projectId: project.id,
            installationId: install.installationId,
            repoFullName: match.fullName,
            defaultBranch: match.defaultBranch,
          },
          update: { defaultBranch: match.defaultBranch },
        });
      }
      if (body.removeRepo) {
        await auth.db.projectRepo.deleteMany({ where: { projectId: project.id, repoFullName: body.removeRepo } });
      }
      const existing = await auth.db.projectGithubSettings.findFirst({ where: { projectId: project.id } });
      const rules = body.rules ?? parseGithubRules(existing?.rules);
      const branchTemplate = body.branchTemplate ?? existing?.branchTemplate ?? '{type}/{key}-{title}';
      if (existing) {
        await auth.db.projectGithubSettings.update({
          where: { id: existing.id },
          data: { rules, branchTemplate },
        });
      } else {
        await auth.db.projectGithubSettings.create({
          data: { tenantId: auth.tenantId, projectId: project.id, rules, branchTemplate },
        });
      }
      return await githubPayload(auth, project, key);
    } catch (err) {
      return sendError(reply, err);
    }
  });
};

type FastifyRequestRaw = { rawBody?: string };

async function githubPayload(auth: Authed, project: { id: string; key: string; leadId: string | null }, key: string) {
  const appOn = githubAppEnabled();
  const install = appOn ? await auth.db.gitHubInstallation.findFirst() : null;
  const repos = appOn ? await auth.db.projectRepo.findMany({ where: { projectId: project.id } }) : [];
  const settings = await auth.db.projectGithubSettings.findFirst({ where: { projectId: project.id } });
  const events = appOn
    ? await auth.db.gitHubEventLog.findMany({
      where: { projectId: project.id },
      orderBy: { at: 'desc' },
      take: 20,
    })
    : [];
  const installer = install
    ? await prisma.user.findUnique({ where: { id: install.installedByUserId }, select: { name: true } })
    : null;
  let available: { name: string; defaultBranch: string }[] = [];
  if (install) {
    try {
      available = (await listInstallationRepos(install.installationId)).map((r) => ({
        name: r.fullName,
        defaultBranch: r.defaultBranch,
      }));
    } catch {
      available = [];
    }
  }
  const member = await auth.db.projectMember.findFirst({
    where: { projectId: project.id, userId: auth.userId },
    include: { roles: { include: { role: true } } },
  });
  const canManage =
    auth.workspaceRole === 'owner' ||
    auth.workspaceRole === 'admin' ||
    project.leadId === auth.userId ||
    Boolean(member?.roles.some((r) => r.role.slug === 'lead'));
  const rules = parseGithubRules(settings?.rules ?? defaultGithubRules);
  return {
    appConfigured: githubAppEnabled(),
    canManage,
    connected: Boolean(install),
    receivingEvents: Boolean(install),
    accountLogin: install?.accountLogin ?? null,
    installedByName: installer?.name ?? null,
    repoAccessCount: available.length,
    manageUrl: githubAppEnabled() ? githubManageUrl() : '',
    installPath: `/github/install?project=${encodeURIComponent(key)}`,
    repos: repos.map((r) => ({ name: r.repoFullName, defaultBranch: r.defaultBranch })),
    availableRepos: available,
    branchTemplate: settings?.branchTemplate ?? '{type}/{key}-{title}',
    exampleBranch: suggestedBranchName(settings?.branchTemplate ?? '{type}/{key}-{title}', 'bug', `${key}-142`, 'checkout fails on safari 17'),
    projectKey: key,
    rules,
    events: events.map((e) => ({
      id: e.id,
      when: e.at.toISOString(),
      text: e.text,
      result: e.result,
      tone: e.tone,
    })),
  };
}
