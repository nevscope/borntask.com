// Apply prisma/migrations on a database that was first created with db push.
// Empty databases get a push first. Existing ones that hit P3005 are baselined:
// already-present changes are marked applied, then remaining SQL runs.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const schema = fileURLToPath(new URL('./schema.prisma', import.meta.url));

export const CHECKS = [
  { name: '20261016120000_chat_integration_userid', kind: 'column', table: 'ChatIntegration', column: 'userId' },
  { name: '20261016140000_github_app', kind: 'table', table: 'GitHubInstallation' },
  { name: '20261016160000_project_automations', kind: 'table', table: 'Automation' },
  { name: '20261016180000_status_colour', kind: 'column', table: 'WorkflowStatus', column: 'colour' },
  { name: '20261016180001_status_colour_backfill', kind: 'column', table: 'WorkflowStatus', column: 'colour' },
  { name: '20261021230000_task_section_cascade', kind: 'fkCascade', constraint: 'Task_sectionId_fkey' },
  { name: '20261022190000_project_disabled_types', kind: 'column', table: 'Project', column: 'disabledTypes' },
  { name: '20261023160000_notification_actor', kind: 'column', table: 'Notification', column: 'actorId' },
  { name: '20261023170000_access_request', kind: 'table', table: 'AccessRequest' },
  { name: '20261028120000_email_login_codes', kind: 'table', table: 'EmailLoginCode' },
  { name: '20261028213000_comment_replies_email_per_task', kind: 'column', table: 'Comment', column: 'parentId' },
  { name: '20261028220000_comment_via', kind: 'column', table: 'Comment', column: 'via' },
  { name: '20261029150000_work_breakdown', kind: 'column', table: 'Project', column: 'workBreakdown' },
  { name: '20261029230000_comment_reactions', kind: 'table', table: 'CommentReaction' },
  { name: '20261031140000_timesheets_reports', kind: 'table', table: 'TimesheetEntry' },
  { name: '20261031160000_timesheet_edit_days', kind: 'column', table: 'Workspace', column: 'timesheetEditDays' },
];

function prisma(args) {
  return spawnSync('npx', ['prisma', ...args, '--schema', schema], {
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });
}

function fail(message, extra = '') {
  if (extra) process.stderr.write(extra);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function tableExists(db, table) {
  const rows = await db.$queryRawUnsafe(
    'SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    table,
  );
  return rows.length > 0;
}

async function columnExists(db, table, column) {
  const rows = await db.$queryRawUnsafe(
    'SELECT 1 AS ok FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    table,
    column,
  );
  return rows.length > 0;
}

async function fkIsCascade(db, constraint) {
  const rows = await db.$queryRawUnsafe(
    'SELECT DELETE_RULE AS rule FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? LIMIT 1',
    constraint,
  );
  return rows[0]?.rule === 'CASCADE';
}

async function recorded(db, name) {
  if (!(await tableExists(db, '_prisma_migrations'))) return false;
  const rows = await db.$queryRawUnsafe(
    'SELECT 1 AS ok FROM `_prisma_migrations` WHERE `migration_name` = ? LIMIT 1',
    name,
  );
  return rows.length > 0;
}

async function alreadyInSchema(db, check) {
  if (check.kind === 'table') return tableExists(db, check.table);
  if (check.kind === 'column') return columnExists(db, check.table, check.column);
  if (check.kind === 'fkCascade') return fkIsCascade(db, check.constraint);
  return false;
}

async function baseline() {
  const db = new PrismaClient();
  try {
    if (!(await tableExists(db, 'Workspace'))) {
      const pushed = prisma(['db', 'push', '--accept-data-loss=false']);
      process.stdout.write(pushed.stdout);
      process.stderr.write(pushed.stderr);
      if (pushed.status !== 0) fail('prisma db push failed on an empty database.');
    }
    const names = [];
    for (const check of CHECKS) {
      if (await recorded(db, check.name)) continue;
      if (await alreadyInSchema(db, check)) names.push(check.name);
    }
    return names;
  } finally {
    await db.$disconnect();
  }
}

function print(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function deploy() {
  return prisma(['migrate', 'deploy']);
}

async function main() {
  const first = deploy();
  print(first);
  if (first.status === 0) return;

  const text = `${first.stdout}\n${first.stderr}`;
  if (!text.includes('P3005')) fail('prisma migrate deploy failed.', text);

  process.stdout.write('Database already has tables. Baselining migrations that are already present.\n');
  const applied = await baseline();
  for (const name of applied) {
    process.stdout.write(`Marking ${name} as applied.\n`);
    const resolved = prisma(['migrate', 'resolve', '--applied', name]);
    print(resolved);
    if (resolved.status !== 0) fail(`Could not mark ${name} as applied.`);
  }

  const second = deploy();
  print(second);
  if (second.status !== 0) fail('prisma migrate deploy failed after baseline.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
