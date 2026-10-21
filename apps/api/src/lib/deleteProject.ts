import type { Authed } from '../context.js';
import { prisma } from '../db.js';
import { notFound, validation } from '../errors.js';

export async function deleteProject(auth: Authed, project: { id: string; name: string }, typedName: string) {
  if (typedName.trim() !== project.name) {
    throw validation('Type the project name to delete it.');
  }
  const tenantId = auth.tenantId;
  const projectId = project.id;

  // Tenant client $transaction does not keep one MySQL transaction. Use the
  // base client and put tenantId on every where-clause.
  await prisma.$transaction(async (tx) => {
    const owned = await tx.project.findFirst({ where: { id: projectId, tenantId } });
    if (!owned) throw notFound();

    const sections = await tx.section.findMany({ where: { projectId, tenantId }, select: { id: true } });
    const sectionIds = sections.map((row) => row.id);
    const tasks = await tx.task.findMany({
      where: {
        tenantId,
        OR: [{ projectId }, ...(sectionIds.length ? [{ sectionId: { in: sectionIds } }] : [])],
      },
      select: { id: true },
    });
    const taskIds = tasks.map((row) => row.id);

    if (taskIds.length) {
      await tx.activityLog.updateMany({ where: { tenantId, taskId: { in: taskIds } }, data: { taskId: null } });
      await tx.notification.deleteMany({ where: { tenantId, taskId: { in: taskIds } } });
      await tx.taskWatcher.deleteMany({ where: { tenantId, taskId: { in: taskIds } } });
      await tx.taskLabel.deleteMany({ where: { tenantId, taskId: { in: taskIds } } });
      await tx.comment.deleteMany({ where: { tenantId, taskId: { in: taskIds } } });
      await tx.attachment.deleteMany({ where: { tenantId, taskId: { in: taskIds } } });
      await tx.devLink.deleteMany({ where: { tenantId, taskId: { in: taskIds } } });
      await tx.task.deleteMany({ where: { tenantId, id: { in: taskIds }, parentId: { not: null } } });
      await tx.task.deleteMany({ where: { tenantId, id: { in: taskIds } } });
    }

    await tx.invitation.updateMany({ where: { tenantId, projectId }, data: { projectId: null } });
    await tx.chatIntegration.updateMany({ where: { tenantId, projectId }, data: { projectId: null } });
    await tx.section.deleteMany({ where: { tenantId, projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });
}
