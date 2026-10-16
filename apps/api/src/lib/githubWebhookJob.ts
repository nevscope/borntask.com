import {
  atOrPast,
  extractTaskKeys,
  parseGithubRules,
  type GithubRules,
} from '@borntask/shared';
import { Prisma } from '@prisma/client';
import { prisma, createTenantClient } from '../db.js';
import type { Authed } from '../context.js';
import { moveTask } from './moveTask.js';
import { findTaskByKey, loadWorkflow, taskKey } from './loadProject.js';

type Job = { event: string; payload: Record<string, unknown> };

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): string {
  return typeof value === 'number' ? String(value) : str(value);
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function installationIdOf(payload: Record<string, unknown>): string {
  return num(obj(payload.installation).id);
}

function repoFullName(payload: Record<string, unknown>): string {
  return str(obj(payload.repository).full_name);
}

async function githubAuth(tenantId: string, userId: string): Promise<Authed> {
  const membership = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
  return {
    userId,
    tenantId,
    workspaceRole: membership?.tenantRole ?? 'member',
    db: createTenantClient(tenantId),
    via: 'github',
    actorType: 'automation',
    tokenScope: 'session',
  };
}

async function logEvent(
  db: ReturnType<typeof createTenantClient>,
  tenantId: string,
  projectId: string,
  text: string,
  result: string,
  tone: 'ink' | 'brand' | 'warning',
) {
  await db.gitHubEventLog.create({ data: { tenantId, projectId, text, result, tone } });
}

async function upsertLink(
  db: ReturnType<typeof createTenantClient>,
  tenantId: string,
  data: {
    taskId: string;
    kind: 'branch' | 'pr' | 'commit';
    repoFullName: string;
    ref: string;
    url: string;
    prState?: string | null;
    checks?: 'pending' | 'running' | 'passed' | 'failed' | null;
    authorLogin?: string | null;
    extra?: string | null;
  },
) {
  await db.devLink.upsert({
    where: {
      taskId_kind_repoFullName_ref: {
        taskId: data.taskId,
        kind: data.kind,
        repoFullName: data.repoFullName,
        ref: data.ref,
      },
    },
    create: { tenantId, ...data },
    update: {
      url: data.url,
      prState: data.prState ?? undefined,
      checks: data.checks ?? undefined,
      authorLogin: data.authorLogin ?? undefined,
      extra: data.extra ?? undefined,
    },
  });
}

async function tryMove(
  auth: Authed,
  key: string,
  toSlug: string,
  rulesOk: boolean,
): Promise<'moved' | 'skipped'> {
  if (!rulesOk) return 'skipped';
  const row = await findTaskByKey(auth.db, key);
  if (!row || row.deletedAt) return 'skipped';
  const wf = await loadWorkflow(auth.db, row.project.workflowId);
  if (!wf.statusIdBySlug[toSlug]) return 'skipped';
  if (atOrPast(row.status.slug, toSlug, wf.statuses.map((s) => ({ slug: s.id, position: s.position })))) {
    return 'skipped';
  }
  try {
    await moveTask(auth, key, { toStatusId: toSlug });
    return 'moved';
  } catch {
    return 'skipped';
  }
}

async function linkedTasks(
  db: ReturnType<typeof createTenantClient>,
  keys: string[],
  projectIds: Set<string>,
) {
  const out: { id: string; key: string; projectId: string; title: string }[] = [];
  for (const key of keys) {
    const row = await findTaskByKey(db, key);
    if (!row || row.deletedAt) continue;
    if (!projectIds.has(row.projectId)) continue;
    out.push({ id: row.id, key: taskKey(row.project.key, row.number), projectId: row.projectId, title: row.title });
  }
  return out;
}

function rulesFor(value: Prisma.JsonValue | null | undefined): GithubRules {
  return parseGithubRules(value);
}

export async function runGitHubWebhookJob(job: Job): Promise<{ ok: boolean }> {
  const installationId = installationIdOf(job.payload);
  if (!installationId) return { ok: true };
  const install = await prisma.gitHubInstallation.findUnique({ where: { installationId } });
  if (!install) return { ok: true };
  const db = createTenantClient(install.tenantId);
  const auth = await githubAuth(install.tenantId, install.installedByUserId);
  const repos = await db.projectRepo.findMany({ where: { installationId } });
  const repoName = repoFullName(job.payload);
  const matching = repoName ? repos.filter((r) => r.repoFullName.toLowerCase() === repoName.toLowerCase()) : repos;
  const projectIds = new Set(matching.map((r) => r.projectId));
  const settings = await db.projectGithubSettings.findMany({
    where: { projectId: { in: [...projectIds] } },
  });
  const rulesByProject = new Map(settings.map((s) => [s.projectId, rulesFor(s.rules)]));

  async function withProjects(fn: (projectId: string, rules: GithubRules) => Promise<void>) {
    for (const projectId of projectIds) {
      await fn(projectId, rulesByProject.get(projectId) ?? parseGithubRules(null));
    }
  }

  if (job.event === 'create') {
    const refType = str(job.payload.ref_type);
    const ref = str(job.payload.ref);
    if (refType !== 'branch' || !ref) return { ok: true };
    const keys = extractTaskKeys(ref);
    const tasks = await linkedTasks(auth.db, keys, projectIds);
    if (!tasks.length) {
      await withProjects(async (projectId) => {
        if (keys.length) {
          await logEvent(db, install.tenantId, projectId, `Commit or branch mentions ${keys.join(', ')}, which does not exist on this project`, 'Ignored', 'warning');
        }
      });
      return { ok: true };
    }
    for (const task of tasks) {
      await upsertLink(db, install.tenantId, {
        taskId: task.id,
        kind: 'branch',
        repoFullName: repoName,
        ref,
        url: `https://github.com/${repoName}/tree/${encodeURIComponent(ref)}`,
      });
      const rules = rulesByProject.get(task.projectId) ?? parseGithubRules(null);
      const moved = await tryMove(auth, task.key, 'wip', rules.branchCreated);
      await logEvent(
        db,
        install.tenantId,
        task.projectId,
        `Branch ${ref} created, linked to ${task.key}`,
        moved === 'moved' ? 'Moved to WIP' : 'Linked',
        moved === 'moved' ? 'brand' : 'ink',
      );
    }
    return { ok: true };
  }

  if (job.event === 'pull_request') {
    const action = str(job.payload.action);
    const pr = obj(job.payload.pull_request);
    const number = num(pr.number);
    const title = str(pr.title);
    const body = str(pr.body);
    const head = obj(pr.head);
    const branch = str(head.ref);
    const htmlUrl = str(pr.html_url);
    const user = str(obj(pr.user).login);
    const draft = pr.draft === true;
    const merged = pr.merged === true;
    const keys = extractTaskKeys(title, body, branch);
    const tasks = await linkedTasks(auth.db, keys, projectIds);
    if (!tasks.length) {
      await withProjects(async (projectId) => {
        if (keys.length) {
          await logEvent(db, install.tenantId, projectId, `PR #${number} "${title}" mentions ${keys.join(', ')}, which does not exist`, 'Ignored', 'warning');
        }
      });
      return { ok: true };
    }
    const prState = merged ? 'merged' : str(pr.state) === 'closed' ? 'closed' : 'open';
    for (const task of tasks) {
      await upsertLink(db, install.tenantId, {
        taskId: task.id,
        kind: 'pr',
        repoFullName: repoName,
        ref: number,
        url: htmlUrl,
        prState,
        authorLogin: user,
        extra: title,
      });
      if (branch) {
        await upsertLink(db, install.tenantId, {
          taskId: task.id,
          kind: 'branch',
          repoFullName: repoName,
          ref: branch,
          url: `https://github.com/${repoName}/tree/${encodeURIComponent(branch)}`,
        });
      }
      const rules = rulesByProject.get(task.projectId) ?? parseGithubRules(null);
      if (action === 'opened' || action === 'ready_for_review' || action === 'reopened') {
        if (draft && !rules.draftPr) {
          await logEvent(db, install.tenantId, task.projectId, `Draft PR #${number} "${title}" opened by ${user}, linked to ${task.key}`, 'No change', 'ink');
          continue;
        }
        const treatDraft = draft && rules.draftPr;
        if (!draft || treatDraft) {
          const moved = await tryMove(auth, task.key, 'ready_for_testing', rules.prOpened);
          await logEvent(
            db,
            install.tenantId,
            task.projectId,
            `PR #${number} "${title}" opened by ${user}, linked to ${task.key}`,
            moved === 'moved' ? 'Moved to Ready for testing' : 'Linked',
            moved === 'moved' ? 'brand' : 'ink',
          );
        }
      } else if (action === 'closed' && merged) {
        const moved = await tryMove(auth, task.key, 'ready_for_testing', rules.prMerged);
        await logEvent(
          db,
          install.tenantId,
          task.projectId,
          `Branch ${branch || title} merged into the default branch`,
          moved === 'moved' ? 'Moved to Ready for testing' : 'Already there or past it',
          moved === 'moved' ? 'brand' : 'ink',
        );
      } else if (action === 'closed' && !merged) {
        if (rules.prClosedUnmerged) {
          await auth.db.comment.create({
            data: {
              tenantId: install.tenantId,
              taskId: task.id,
              authorId: auth.userId,
              body: `Pull request #${number} was closed without merging.`,
            },
          });
        }
        await logEvent(db, install.tenantId, task.projectId, `PR #${number} "${title}" closed unmerged, linked to ${task.key}`, 'Comment added', 'ink');
      }
    }
    return { ok: true };
  }

  if (job.event === 'push') {
    const commits = Array.isArray(job.payload.commits) ? job.payload.commits : [];
    for (const raw of commits) {
      const commit = obj(raw);
      const message = str(commit.message);
      const sha = str(commit.id).slice(0, 40);
      const url = str(commit.url) || `https://github.com/${repoName}/commit/${sha}`;
      const keys = extractTaskKeys(message);
      const tasks = await linkedTasks(auth.db, keys, projectIds);
      if (!tasks.length && keys.length) {
        await withProjects(async (projectId) => {
          await logEvent(db, install.tenantId, projectId, `Commit mentions ${keys.join(', ')}, which does not exist`, 'Ignored', 'warning');
        });
      }
      for (const task of tasks) {
        await upsertLink(db, install.tenantId, {
          taskId: task.id,
          kind: 'commit',
          repoFullName: repoName,
          ref: sha.slice(0, 12),
          url,
          extra: message.split('\n')[0] ?? '',
        });
      }
    }
    return { ok: true };
  }

  if (job.event === 'check_suite' || job.event === 'check_run' || job.event === 'status') {
    const suite = obj(job.payload.check_suite || job.payload.check_run || job.payload);
    const conclusion = str(suite.conclusion || obj(job.payload).state);
    const status = str(suite.status);
    let checks: 'pending' | 'running' | 'passed' | 'failed' = 'pending';
    if (status === 'in_progress' || status === 'queued') checks = 'running';
    if (conclusion === 'success' || conclusion === 'success'.toString()) checks = 'passed';
    if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'cancelled' || str(job.payload.state) === 'failure') {
      checks = 'failed';
    }
    if (str(job.payload.state) === 'pending') checks = 'running';
    if (str(job.payload.state) === 'success') checks = 'passed';
    const prs = Array.isArray(suite.pull_requests) ? suite.pull_requests : [];
    for (const raw of prs) {
      const pr = obj(raw);
      const number = num(pr.number);
      const links = await db.devLink.findMany({ where: { kind: 'pr', ref: number, repoFullName: repoName } });
      for (const link of links) {
        await db.devLink.update({ where: { id: link.id }, data: { checks } });
      }
    }
    return { ok: true };
  }

  if (job.event === 'installation' && str(job.payload.action) === 'deleted') {
    await prisma.gitHubInstallation.deleteMany({ where: { installationId } });
  }

  return { ok: true };
}
