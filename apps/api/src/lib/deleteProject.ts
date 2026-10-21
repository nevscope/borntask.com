import type { Authed } from '../context.js';
import { validation } from '../errors.js';

export async function deleteProject(auth: Authed, project: { id: string; name: string }, typedName: string) {
  if (typedName.trim() !== project.name) {
    throw validation('Type the project name to delete it.');
  }
  await auth.db.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({ where: { projectId: project.id }, select: { id: true } });
    const taskIds = tasks.map((row) => row.id);
    if (taskIds.length) {
      await tx.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.notification.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.taskWatcher.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.taskLabel.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.comment.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.attachment.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.devLink.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.task.deleteMany({ where: { projectId: project.id, parentId: { not: null } } });
      await tx.task.deleteMany({ where: { projectId: project.id } });
    }
    await tx.invitation.updateMany({ where: { projectId: project.id }, data: { projectId: null } });
    await tx.chatIntegration.updateMany({ where: { projectId: project.id }, data: { projectId: null } });
    // Sections cascade from project, but Task.sectionId is RESTRICT. Remove them only after tasks.
    await tx.section.deleteMany({ where: { projectId: project.id } });
    await tx.project.delete({ where: { id: project.id } });
  });
}
