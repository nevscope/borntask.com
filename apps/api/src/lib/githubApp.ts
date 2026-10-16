import { createAppAuth } from '@octokit/auth-app';
import { config, githubAppEnabled } from '../env.js';

export function githubManageUrl(): string {
  return `https://github.com/apps/${config.githubAppSlug}`;
}

export function githubInstallUrl(state: string): string {
  const url = new URL(`https://github.com/apps/${config.githubAppSlug}/installations/new`);
  url.searchParams.set('state', state);
  return url.toString();
}

function appAuth() {
  if (!githubAppEnabled()) throw new Error('GitHub App is not configured.');
  return createAppAuth({
    appId: config.githubAppId,
    privateKey: config.githubPrivateKey,
  });
}

export async function installationToken(installationId: string): Promise<string> {
  const result = await appAuth()({ type: 'installation', installationId: Number(installationId) });
  return result.token;
}

export async function installationAccountLogin(installationId: string): Promise<string> {
  const result = await appAuth()({ type: 'app' });
  const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: {
      authorization: `Bearer ${result.token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'BornTask',
    },
  });
  if (!res.ok) return 'github';
  const body = (await res.json()) as { account?: { login?: string } };
  return body.account?.login ?? 'github';
}

export type GhRepo = { fullName: string; defaultBranch: string };

export async function listInstallationRepos(installationId: string): Promise<GhRepo[]> {
  const token = await installationToken(installationId);
  const repos: GhRepo[] = [];
  let page = 1;
  while (page <= 10) {
    const res = await fetch(`https://api.github.com/installation/repositories?per_page=100&page=${page}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'BornTask',
      },
    });
    if (!res.ok) throw new Error('Could not list GitHub repositories.');
    const body = (await res.json()) as {
      repositories?: { full_name: string; default_branch: string }[];
    };
    const batch = body.repositories ?? [];
    for (const repo of batch) {
      repos.push({ fullName: repo.full_name, defaultBranch: repo.default_branch || 'main' });
    }
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}
