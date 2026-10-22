import type { Authed } from '../context.js';

export async function inAppAllowed(auth: Authed, userId: string, event: string): Promise<boolean> {
  const pref = await auth.db.notificationPreference.findFirst({
    where: { userId, event, channel: 'in_app' },
  });
  return pref ? pref.enabled : true;
}

export async function notifyInApp(
  auth: Authed,
  userId: string,
  event: string,
  data: { kind: string; taskId?: string },
): Promise<void> {
  if (userId === auth.userId) return;
  if (!(await inAppAllowed(auth, userId, event))) return;
  await auth.db.notification.create({
    data: {
      tenantId: auth.tenantId,
      userId,
      kind: data.kind,
      taskId: data.taskId,
    },
  });
}
