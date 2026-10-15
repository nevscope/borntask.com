import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseDelimited } from '@borntask/shared';
import { deliverMail } from './mail.js';

const prisma = new PrismaClient();
const blobRoot = process.env.BLOB_ROOT ?? '.data/blobs';
const publicUrl = (process.env.PUBLIC_URL ?? 'http://localhost:5174').replace(/\/$/, '');

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function runAsanaImport(data: { tenantId: string; importJobId: string; actorId: string }) {
  const job = await prisma.importJob.findUnique({ where: { id: data.importJobId } });
  if (!job) throw new Error('Import job not found');
  const project = await prisma.project.findUnique({ where: { id: job.projectId } });
  if (!project) throw new Error('Project not found');

  const text = await readFile(join(blobRoot, job.storageKey), 'utf8');
  const parsed = parseDelimited(text);
  const stored = (job.mapping ?? {}) as { columns?: Record<string, string>; sectionsAs?: string } | Record<string, string>;
  const columns = 'columns' in stored && stored.columns ? stored.columns : (stored as Record<string, string>);

  const col = (field: string) => Object.entries(columns).find(([, f]) => f === field)?.[0];
  const titleCol = col('title');
  const idCol = col('asanaTaskId');
  const descCol = col('description');
  const emailCol = col('assigneeEmail');
  const sectionCol = col('section');
  const statusCol = col('status');
  const dueCol = col('dueDate');
  const typeCol = col('type');
  const parentCol = col('parentAsanaId');

  const types = await prisma.taskType.findMany({ where: { tenantId: data.tenantId } });
  const defaultType = types.find((t) => t.slug === 'idea') ?? types[0];
  if (!defaultType) throw new Error('No task types');
  const statuses = await prisma.workflowStatus.findMany({
    where: { tenantId: data.tenantId, workflowId: project.workflowId },
    orderBy: { position: 'asc' },
  });
  const startStatus = statuses.find((s) => s.slug === 'idea' || s.slug === 'todo') ?? statuses[0];
  if (!startStatus) throw new Error('No statuses');
  let sections = await prisma.section.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } });
  if (sections.length === 0) {
    const inbox = await prisma.section.create({
      data: { tenantId: data.tenantId, projectId: project.id, name: 'Inbox', position: 'a0' },
    });
    sections = [inbox];
  }

  const members = await prisma.tenantMember.findMany({ where: { tenantId: data.tenantId, isActive: true } });
  const users = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) } } });
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  const errors: string[] = [];
  const asanaToTaskId = new Map<string, string>();
  let last = await prisma.task.findFirst({ where: { projectId: project.id }, orderBy: { number: 'desc' } });
  let number = last?.number ?? 0;
  let done = 0;

  const unknownEmails = new Set<string>();

  for (const row of parsed.rows) {
    const title = (titleCol ? row[titleCol] : '')?.trim() || 'Untitled';
    const asanaId = idCol ? (row[idCol] ?? '').trim() : '';
    const email = emailCol ? (row[emailCol] ?? '').trim().toLowerCase() : '';
    if (email && email.includes('@') && !userByEmail.has(email)) unknownEmails.add(email);

    const existing = asanaId
      ? await prisma.task.findFirst({ where: { tenantId: data.tenantId, asanaTaskId: asanaId } })
      : null;

    const sectionName = sectionCol ? (row[sectionCol] ?? '').trim() : '';
    let section = sections[0]!;
    if (sectionName) {
      const found = sections.find((s) => s.name.toLowerCase() === sectionName.toLowerCase());
      if (found) section = found;
      else {
        const created = await prisma.section.create({
          data: {
            tenantId: data.tenantId,
            projectId: project.id,
            name: sectionName,
            position: `a${sections.length}`,
          },
        });
        sections.push(created);
        section = created;
      }
    }

    const statusName = statusCol ? (row[statusCol] ?? '').trim().toLowerCase() : '';
    const status = statuses.find((s) => s.slug === statusName || s.name.toLowerCase() === statusName) ?? startStatus;
    const typeName = typeCol ? (row[typeCol] ?? '').trim().toLowerCase() : '';
    const type = types.find((t) => t.slug === typeName || t.name.toLowerCase() === typeName) ?? defaultType;
    const dueRaw = dueCol ? (row[dueCol] ?? '').trim() : '';
    const dueDate = dueRaw ? new Date(dueRaw) : null;
    const assignee = email ? userByEmail.get(email) : undefined;

    const payload = {
      title,
      description: descCol ? row[descCol] ?? '' : '',
      typeId: type.id,
      statusId: status.id,
      sectionId: section.id,
      assigneeId: assignee?.id ?? null,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      asanaTaskId: asanaId || null,
    };

    if (existing) {
      await prisma.task.update({ where: { id: existing.id }, data: payload });
      if (asanaId) asanaToTaskId.set(asanaId, existing.id);
    } else {
      number += 1;
      const created = await prisma.task.create({
        data: {
          tenantId: data.tenantId,
          projectId: project.id,
          number,
          reporterId: data.actorId,
          position: `a${number}`,
          ...payload,
        },
      });
      await prisma.activityLog.create({
        data: {
          tenantId: data.tenantId,
          taskId: created.id,
          actorId: data.actorId,
          via: 'import',
          action: 'imported from Asana',
        },
      });
      if (asanaId) asanaToTaskId.set(asanaId, created.id);
    }
    done += 1;
    if (done % 25 === 0) {
      await prisma.importJob.update({ where: { id: job.id }, data: { rowsDone: done } });
    }
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
        projectId: project.id,
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
