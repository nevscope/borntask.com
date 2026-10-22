import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient, type ImportJob } from '@prisma/client';
import { ASANA_API_COLUMNS, emailFromMappedRow, formatImportError, guessImportStatusSlug, guessImportTypeSlug, isAsanaApiMapping, parseDelimited, type AsanaImportMapping } from '@borntask/shared';
import { fetchAsanaSheet, type AsanaStoryExtra } from './asanaClient.js';
import { deliverMail } from './mail.js';

const prisma = new PrismaClient();
const blobRoot = process.env.BLOB_ROOT ?? '.data/blobs';
const publicUrl = (process.env.PUBLIC_URL ?? 'http://localhost:5174').replace(/\/$/, '');

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function clip(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max);
}

export async function runAsanaImport(data: { tenantId: string; importJobId: string; actorId: string; asanaToken?: string }) {
  const job = await prisma.importJob.findUnique({ where: { id: data.importJobId } });
  if (!job) throw new Error('Import job not found');
  try {
    return await executeAsanaImport(job, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'failed', errors: [message] },
    });
    throw err;
  }
}

async function executeAsanaImport(
  job: ImportJob,
  data: { tenantId: string; importJobId: string; actorId: string; asanaToken?: string },
) {
  const project = await prisma.project.findUnique({ where: { id: job.projectId } });
  if (!project) throw new Error('Project not found');
  const projectId = project.id;
  const workflowId = project.workflowId;

  const stored = (job.mapping ?? {}) as { columns?: Record<string, string>; sectionsAs?: string };
  const apiMapping = isAsanaApiMapping(job.mapping as unknown) ? job.mapping as AsanaImportMapping : null;
  let extras = new Map<string, AsanaStoryExtra>();
  let parsed = { headers: [] as string[], rows: [] as Record<string, string>[] };
  if (apiMapping) {
    if (!data.asanaToken) throw new Error('Asana token missing from the job.');
    const sheet = await fetchAsanaSheet(data.asanaToken, apiMapping.asanaProjectGid, async (progress) => {
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          rowsTotal: progress.listed,
          rowsDone: progress.read,
          mapping: { ...apiMapping, phase: progress.phase },
        },
      });
    });
    parsed = sheet;
    extras = sheet.extras;
    await prisma.importJob.update({
      where: { id: job.id },
      data: { rowsTotal: sheet.rows.length, rowsDone: 0, mapping: { ...apiMapping, phase: 'writing' } },
    });
  } else {
    const text = await readFile(join(blobRoot, job.storageKey), 'utf8');
    parsed = parseDelimited(text);
  }
  const columns: Record<string, string> = stored.columns ?? (apiMapping ? ASANA_API_COLUMNS : {});
  const sectionsAs = stored.sectionsAs === 'statuses' ? 'statuses' : 'sections';

  const col = (field: string) => Object.entries(columns).find(([, f]) => f === field)?.[0];
  const titleCol = col('title');
  const idCol = col('asanaTaskId');
  const descCol = col('description');
  const emailCol = col('assigneeEmail');
  const sectionCol = col('section');
  const statusCol = col('status');
  const dueCol = col('dueDate');
  const startCol = col('startDate');
  const createdCol = col('createdAt');
  const completedCol = col('completedAt');
  const updatedCol = col('updatedAt');
  const labelsCol = col('labels');
  const typeCol = col('type');
  const parentCol = col('parentAsanaId');

  function parseWhen(raw: string) {
    const value = new Date(raw);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  function parseTags(raw: string) {
    return [...new Set(raw.split(/[,;|]/).map((part) => part.trim()).filter(Boolean))];
  }

  const types = await prisma.taskType.findMany({ where: { tenantId: data.tenantId } });
  const defaultType = types.find((t) => t.slug === 'idea') ?? types[0];
  if (!defaultType) throw new Error('No task types');
  const statuses = await prisma.workflowStatus.findMany({
    where: { tenantId: data.tenantId, workflowId },
    orderBy: { position: 'asc' },
  });
  const startStatus = statuses.find((s) => s.slug === 'idea' || s.slug === 'todo') ?? statuses[0];
  const doneStatus = statuses.find((s) => s.slug === 'deployed') ?? statuses.find((s) => s.category === 'done' && s.slug !== 'rejected');
  const holdStatus = statuses.find((s) => s.slug === 'on_hold');
  if (!startStatus) throw new Error('No statuses');
  let sections = await prisma.section.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
  if (sections.length === 0) {
    const inbox = await prisma.section.create({
      data: { tenantId: data.tenantId, projectId, name: 'Inbox', position: 'a0000' },
    });
    sections = [inbox];
  }

  let labels = await prisma.label.findMany({ where: { tenantId: data.tenantId, projectId } });
  const labelColour = '#5B6157';

  async function labelFor(name: string) {
    const found = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
    const created = await prisma.label.create({
      data: { tenantId: data.tenantId, projectId, name, colour: labelColour },
    });
    labels.push(created);
    return created;
  }

  const members = await prisma.tenantMember.findMany({ where: { tenantId: data.tenantId, isActive: true } });
  const users = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) } } });
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  const errors: string[] = [];
  const asanaToTaskId = new Map<string, string>();
  let last = await prisma.task.findFirst({ where: { projectId }, orderBy: { number: 'desc' } });
  let number = last?.number ?? 0;
  let done = 0;

  const unknownEmails = new Set<string>();

  const persistProgress = async () => {
    await prisma.importJob.update({
      where: { id: job.id },
      data: { rowsDone: done, errors: errors.slice(0, 50) },
    });
  };

  for (const [index, row] of parsed.rows.entries()) {
    try {
      const title = clip((titleCol ? row[titleCol] : '')?.trim() || 'Untitled', 191);
      const asanaId = idCol ? (row[idCol] ?? '').trim() : '';
      const email = emailFromMappedRow(row, columns) || (emailCol ? (row[emailCol] ?? '').trim().toLowerCase() : '');
      const assigneeEmail = email.includes('@') ? email : '';
      if (assigneeEmail && !userByEmail.has(assigneeEmail)) unknownEmails.add(assigneeEmail);

      const existing = asanaId
        ? await prisma.task.findFirst({
          where: { tenantId: data.tenantId, asanaTaskId: asanaId },
          orderBy: { deletedAt: 'asc' },
        })
        : null;

      const sectionName = clip(sectionCol ? (row[sectionCol] ?? '').trim() : '', 120);
      let section = sections[0]!;
      if (sectionsAs === 'sections' && sectionName) {
        const found = sections.find((s) => s.name.toLowerCase() === sectionName.toLowerCase());
        if (found) section = found;
        else {
          const created = await prisma.section.create({
            data: {
              tenantId: data.tenantId,
              projectId,
              name: sectionName,
              position: `a${String(sections.length).padStart(4, '0')}`,
            },
          });
          sections.push(created);
          section = created;
        }
      }

      const dueDate = dueCol ? parseWhen((row[dueCol] ?? '').trim()) : null;
      const startDate = startCol ? parseWhen((row[startCol] ?? '').trim()) : null;
      const createdAt = createdCol ? parseWhen((row[createdCol] ?? '').trim()) : null;
      const completedAt = completedCol ? parseWhen((row[completedCol] ?? '').trim()) : null;
      const updatedAt = updatedCol ? parseWhen((row[updatedCol] ?? '').trim()) : null;
      const tagNames = labelsCol ? parseTags(row[labelsCol] ?? '') : [];
      const typeName = typeCol ? (row[typeCol] ?? '').trim() : '';
      const typeSlug = guessImportTypeSlug(tagNames, typeName, types) ?? defaultType.slug;
      const type = types.find((t) => t.slug === typeSlug) ?? defaultType;
      const statusSource = sectionsAs === 'statuses' ? sectionName : (statusCol ? (row[statusCol] ?? '').trim() : '');
      let statusSlug = guessImportStatusSlug(statusSource, statuses)
        ?? (!statusSource && completedAt && doneStatus ? doneStatus.slug : startStatus.slug);
      if (tagNames.some((tag) => tag.toLowerCase() === 'on hold') && holdStatus) statusSlug = holdStatus.slug;
      const status = statuses.find((s) => s.slug === statusSlug) ?? startStatus;
      const assignee = assigneeEmail ? userByEmail.get(assigneeEmail) : undefined;

      const payload = {
        title,
        description: descCol ? row[descCol] ?? '' : '',
        typeId: type.id,
        statusId: status.id,
        sectionId: section.id,
        assigneeId: assignee?.id ?? null,
        dueDate,
        startDate,
        completedAt,
        asanaTaskId: asanaId || null,
        ...(createdAt ? { createdAt } : {}),
      };

      let taskId = existing?.id;
      if (existing) {
        const move = existing.projectId !== projectId || existing.deletedAt;
        if (move) number += 1;
        await prisma.task.update({
          where: { id: existing.id },
          data: {
            ...payload,
            projectId,
            deletedAt: null,
            deletedById: null,
            ...(move ? { number, position: `a${number}` } : {}),
          },
        });
      } else {
        number += 1;
        const created = await prisma.task.create({
          data: {
            tenantId: data.tenantId,
            projectId,
            number,
            reporterId: data.actorId,
            position: `a${number}`,
            ...payload,
            ...(updatedAt ? { updatedAt } : {}),
          },
        });
        taskId = created.id;
        await prisma.activityLog.create({
          data: {
            tenantId: data.tenantId,
            taskId: created.id,
            actorId: data.actorId,
            via: 'import',
            action: 'imported from Asana',
          },
        });
      }
      if (taskId && asanaId) asanaToTaskId.set(asanaId, taskId);
      if (taskId && tagNames.length > 0) {
        for (const name of tagNames) {
          const label = await labelFor(clip(name, 80));
          await prisma.taskLabel.upsert({
            where: { taskId_labelId: { taskId, labelId: label.id } },
            create: { tenantId: data.tenantId, taskId, labelId: label.id },
            update: {},
          });
        }
      }
      if (taskId && asanaId) {
        await writeAsanaStories({
          tenantId: data.tenantId,
          taskId,
          actorId: data.actorId,
          extra: extras.get(asanaId),
          usersByEmail: userByEmail,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'This row could not be saved.';
      errors.push(formatImportError(`Row ${index + 2}: ${message}`));
    }
    done += 1;
    if (done === 1 || done % 10 === 0) await persistProgress();
  }

  for (const row of parsed.rows) {
    const asanaId = idCol ? (row[idCol] ?? '').trim() : '';
    const parentAsana = parentCol ? (row[parentCol] ?? '').trim() : '';
    const childId = asanaId ? asanaToTaskId.get(asanaId) : undefined;
    const parentId = parentAsana ? asanaToTaskId.get(parentAsana) : undefined;
    if (childId && parentId) {
      await prisma.task.update({ where: { id: childId }, data: { parentId } });
    }
  }

  const [workspace, actor] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: data.tenantId } }),
    prisma.user.findUnique({ where: { id: data.actorId } }),
  ]);
  for (const email of unknownEmails) {
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.invitation.create({
      data: {
        tenantId: data.tenantId,
        email,
        tenantRole: 'member',
        projectId,
        tokenHash: hashToken(token),
        invitedById: data.actorId,
        expiresAt,
      },
    });
    try {
      await deliverMail({
        kind: 'invite',
        to: email,
        inviteUrl: `${publicUrl}/invite/${token}`,
        workspaceName: workspace?.name ?? 'BornTask',
        inviterName: actor?.name ?? 'A teammate',
        roleLabel: 'Member',
        message: null,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      console.error('[BornTask] Import invite email failed', err instanceof Error ? err.message : 'unknown');
    }
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: 'done', rowsDone: done, errors },
  });
  return { rowsDone: done, invited: unknownEmails.size };
}

async function writeAsanaStories(input: {
  tenantId: string;
  taskId: string;
  actorId: string;
  extra?: AsanaStoryExtra;
  usersByEmail: Map<string, { id: string }>;
}) {
  if (!input.extra) return;
  const existing = await prisma.comment.findMany({
    where: { taskId: input.taskId, deletedAt: null },
    select: { body: true },
  });
  const have = new Set(existing.map((row) => row.body));
  for (const comment of input.extra.comments) {
    const body = comment.name && comment.name !== 'Asana'
      ? `${comment.name}: ${comment.body}`
      : comment.body;
    if (have.has(body)) continue;
    have.add(body);
    const authorId = (comment.email && input.usersByEmail.get(comment.email)?.id) || input.actorId;
    await prisma.comment.create({
      data: {
        tenantId: input.tenantId,
        taskId: input.taskId,
        authorId,
        body,
        createdAt: comment.at ? new Date(comment.at) : undefined,
      },
    });
  }
  const existingActs = await prisma.activityLog.count({ where: { taskId: input.taskId, via: 'import' } });
  if (existingActs > 1) return;
  for (const event of input.extra.events) {
    await prisma.activityLog.create({
      data: {
        tenantId: input.tenantId,
        taskId: input.taskId,
        actorId: input.actorId,
        via: 'import',
        action: event.text.slice(0, 180),
        at: event.at ? new Date(event.at) : undefined,
      },
    });
  }
}
