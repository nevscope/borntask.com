import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { slug: 'internal' } });
  const user = await prisma.user.findFirst({ where: { email: 'owner@borntask.com' } });
  const project = ws ? await prisma.project.findFirst({ where: { key: 'WEB', tenantId: ws.id } }) : null;
  if (!ws || !user || !project) throw new Error('Seed internal workspace, owner and WEB project first.');
  const install = await prisma.gitHubInstallation.upsert({
    where: { installationId: 'dev-local' },
    create: {
      tenantId: ws.id,
      installationId: 'dev-local',
      accountLogin: 'your-github-org',
      installedByUserId: user.id,
    },
    update: { accountLogin: 'your-github-org' },
  });
  await prisma.projectRepo.upsert({
    where: { projectId_repoFullName: { projectId: project.id, repoFullName: 'your-github-org/website' } },
    create: {
      tenantId: ws.id,
      projectId: project.id,
      installationId: install.installationId,
      repoFullName: 'your-github-org/website',
      defaultBranch: 'main',
    },
    update: {},
  });
  await prisma.projectGithubSettings.upsert({
    where: { projectId: project.id },
    create: {
      tenantId: ws.id,
      projectId: project.id,
      branchTemplate: '{type}/{key}-{title}',
      rules: {
        branchCreated: true,
        prOpened: true,
        draftPr: false,
        prMerged: true,
        prClosedUnmerged: true,
      },
    },
    update: {},
  });
  await prisma.gitHubEventLog.create({
    data: {
      tenantId: ws.id,
      projectId: project.id,
      text: 'PR 231 "Fix 3-D Secure redirect" opened by karl-f, linked to WEB-142',
      result: 'Comment added',
      tone: 'ink',
    },
  });
  console.log('sample github rows for WEB');
}

main().finally(() => prisma.$disconnect());
