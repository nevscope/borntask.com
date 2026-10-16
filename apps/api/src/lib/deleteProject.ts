import type { Authed } from '../context.js';
import { validation } from '../errors.js';

export async function deleteProject(auth: Authed, project: { id: string; name: string }, typedName: string) {
  if (typedName.trim() !== project.name) {
    throw validation('Type the project name to delete it.');
  }
  const tasks = await auth.db.task.findMany({ where: { projectId: project.id }, select: { id: true } });
  const taskIds = tasks.map((row) => row.id);
  await auth.db.$transaction(async (tx) => {
    if (taskIds.length) {
      await tx.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.notification.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.task.deleteMany({ where: { projectId: project.id, parentId: { not: null } } });
      await tx.task.deleteMany({ where: { projectId: project.id } });
    }
    await tx.invitation.updateMany({ where: { projectId: project.id }, data: { projectId: null } });
    await tx.chatIntegration.updateMany({ where: { projectId: project.id }, data: { projectId: null } });
    await tx.project.delete({ where: { id: project.id } });
  });
}
