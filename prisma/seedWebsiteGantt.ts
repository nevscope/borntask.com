import { PrismaClient } from '@prisma/client';
import { createTenantClient } from './tenantClient.js';

const prisma = new PrismaClient();

function ymd(offsetDays: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

const SPECS: {
  title: string;
  type: string;
  status: string;
  section: string;
  start: number | null;
  due: number | null;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
}[] = [
  { title: 'Cookie banner overlaps the nav on mobile', type: 'bug', status: 'approved', section: 'Homepage', start: 1, due: 3, priority: 'high' },
  { title: 'Lazy-load hero and product images', type: 'improvement', status: 'ready_for_testing', section: 'Homepage', start: 0, due: 2, priority: 'high' },
  { title: 'Hero copy for the autumn campaign', type: 'improvement', status: 'approved', section: 'Homepage', start: -4, due: -1, priority: 'medium' },
  { title: 'Customer reviews on product pages', type: 'idea', status: 'idea', section: 'Homepage', start: 8, due: 18, priority: 'medium' },
  { title: 'Rebuild homepage hero in the new layout', type: 'feature', status: 'wip', section: 'Homepage', start: -3, due: 5, priority: 'high' },
  { title: 'Mobile navigation mega-menu', type: 'feature', status: 'wip', section: 'Homepage', start: 2, due: 10, priority: 'medium' },
  { title: 'Trust badges below the fold', type: 'improvement', status: 'testing', section: 'Homepage', start: -6, due: 1, priority: 'low' },
  { title: 'Checkout fails on Safari 17', type: 'bug', status: 'testing', section: 'Checkout', start: -2, due: 0, priority: 'urgent' },
  { title: 'Add Apple Pay to checkout', type: 'feature', status: 'wip', section: 'Checkout', start: 2, due: 7, priority: 'high' },
  { title: 'Show the delivery date before payment', type: 'feature', status: 'approved', section: 'Checkout', start: 6, due: 11, priority: 'medium' },
  { title: 'Guest checkout without an account', type: 'feature', status: 'approved', section: 'Checkout', start: 9, due: 16, priority: 'high' },
  { title: '3-D Secure retry after a declined card', type: 'bug', status: 'wip', section: 'Checkout', start: -1, due: 4, priority: 'urgent' },
  { title: 'Order summary sticky on desktop', type: 'improvement', status: 'ready_for_testing', section: 'Checkout', start: 3, due: 6, priority: 'low' },
  { title: 'Saved addresses on the shipping step', type: 'feature', status: 'idea', section: 'Checkout', start: 14, due: 21, priority: 'medium' },
  { title: 'Rate-limit the login endpoint', type: 'feature', status: 'wip', section: 'Platform', start: 4, due: 9, priority: 'high' },
  { title: 'Broken links on the 404 page', type: 'bug', status: 'on_hold', section: 'Platform', start: -8, due: -2, priority: 'low' },
  { title: 'Move images to the new CDN', type: 'feature', status: 'deployed', section: 'Platform', start: -14, due: -3, priority: 'medium' },
  { title: 'Regenerate the sitemap nightly', type: 'improvement', status: 'deployed', section: 'Platform', start: -18, due: -6, priority: 'low' },
  { title: 'Search indexing for product pages', type: 'feature', status: 'testing', section: 'Platform', start: -5, due: 3, priority: 'high' },
  { title: 'CMS preview for editors', type: 'feature', status: 'approved', section: 'Platform', start: 7, due: 14, priority: 'medium' },
  { title: 'Redirect map after the URL redesign', type: 'improvement', status: 'wip', section: 'Platform', start: 0, due: 8, priority: 'high' },
  { title: 'Cookie consent audit for analytics', type: 'bug', status: 'ready_for_testing', section: 'Platform', start: 1, due: 5, priority: 'medium' },
  { title: 'Footer legal links in every locale', type: 'improvement', status: 'idea', section: 'Platform', start: 12, due: 19, priority: 'low' },
  { title: 'Staging smoke tests after deploy', type: 'improvement', status: 'verified', section: 'Platform', start: -12, due: -9, priority: 'none' },
];

async function ensureSection(
  db: ReturnType<typeof createTenantClient>,
  tenantId: string,
  projectId: string,
  name: string,
  index: number,
) {
  const existing = await db.section.findFirst({ where: { projectId, name } });
  if (existing) return existing;
  return db.section.create({
    data: {
      tenantId,
      projectId,
      name,
      position: `a${String(index).padStart(4, '0')}`,
    },
  });
}

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { slug: 'internal' } });
  if (!workspace) throw new Error('Workspace internal is missing. Run npm run db:seed first.');

  const db = createTenantClient(workspace.id);
  const project = await db.project.findFirst({ where: { key: 'WEB' } });
  if (!project) throw new Error('Project WEB is missing.');

  const types = await db.taskType.findMany();
  const typeBySlug = Object.fromEntries(types.map((t) => [t.slug, t.id]));
  const statuses = await db.workflowStatus.findMany({ where: { workflowId: project.workflowId } });
  const statusBySlug = Object.fromEntries(statuses.map((s) => [s.slug, s.id]));

  const homepage = await ensureSection(db, workspace.id, project.id, 'Homepage', 1);
  const checkout = await ensureSection(db, workspace.id, project.id, 'Checkout', 2);
  const platform = await ensureSection(db, workspace.id, project.id, 'Platform', 3);
  const sections: Record<string, string> = {
    Homepage: homepage.id,
    Checkout: checkout.id,
    Platform: platform.id,
  };

  const existing = await db.task.findMany({
    where: { projectId: project.id, parentId: null },
    select: { title: true, number: true, deletedAt: true },
  });
  const titles = new Set(existing.filter((t) => !t.deletedAt).map((t) => t.title));
  let nextNumber = existing.reduce((max, t) => Math.max(max, t.number), 0) + 1;
  let pos = existing.filter((t) => !t.deletedAt).length;

  const seedTask = existing.find((t) => t.title === 'Seed task for internal workspace');
  if (seedTask) {
    await db.task.updateMany({
      where: { projectId: project.id, title: seedTask.title },
      data: { startDate: ymd(-10), dueDate: ymd(-7), sectionId: homepage.id },
    });
  }

  let created = 0;
  for (const spec of SPECS) {
    if (titles.has(spec.title)) continue;
    const typeId = typeBySlug[spec.type];
    const statusId = statusBySlug[spec.status];
    const sectionId = sections[spec.section];
    if (!typeId || !statusId || !sectionId) {
      throw new Error(`Missing lookup for ${spec.title} (${spec.type}/${spec.status}/${spec.section})`);
    }
    await db.task.create({
      data: {
        tenantId: workspace.id,
        projectId: project.id,
        number: nextNumber,
        title: spec.title,
        typeId,
        statusId,
        sectionId,
        reporterId: project.leadId,
        assigneeId: project.leadId,
        priority: spec.priority,
        startDate: spec.start === null ? null : ymd(spec.start),
        dueDate: spec.due === null ? null : ymd(spec.due),
        position: `a${String(pos).padStart(4, '0')}`,
      },
    });
    nextNumber += 1;
    pos += 1;
    created += 1;
  }

  console.log(`Website Gantt seed: created ${created} tasks on WEB (${workspace.slug}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
