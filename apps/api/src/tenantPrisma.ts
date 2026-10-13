import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  'Workspace',
  'TenantMember',
  'Invitation',
  'InviteRequest',
  'AccessRequest',
  'Project',
  'ProjectRole',
  'ProjectMember',
  'ProjectMemberRole',
  'Section',
  'TaskType',
  'Workflow',
  'WorkflowStatus',
  'WorkflowTransition',
  'Task',
  'TaskWatcher',
  'Label',
  'TaskLabel',
  'Comment',
  'Attachment',
  'ActivityLog',
  'SavedView',
  'Favourite',
  'Notification',
  'NotificationPreference',
  'ChatIntegration',
  'ApiToken',
  'OAuthClient',
  'OAuthGrant',
  'ImportJob',
]);

function andTenant(where: unknown, tenantId: string): Record<string, unknown> {
  if (!where || typeof where !== 'object') return { tenantId };
  return { AND: [{ tenantId }, where] };
}

function withTenantData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((row) => ({ ...(row as object), tenantId }));
  if (data && typeof data === 'object') return { ...(data as object), tenantId };
  return data;
}

export function createTenantClient(tenantId: string) {
  if (!tenantId) throw new Error('tenantId is required');

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) {
            return query(args);
          }

          if (model === 'Workspace') {
            const next = { ...(args as Record<string, unknown>) };
            if (operation.startsWith('find') || operation === 'count' || operation === 'aggregate') {
              if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                next.where = { id: tenantId };
              } else {
                next.where = andTenant(next.where, tenantId);
              }
            }
            return query(next);
          }

          const next = { ...(args as Record<string, unknown>) };

          if (operation === 'create') {
            next.data = withTenantData(next.data, tenantId);
            return query(next);
          }
          if (operation === 'createMany') {
            next.data = withTenantData(next.data, tenantId);
            return query(next);
          }
          if (operation === 'upsert') {
            next.where = andTenant(next.where, tenantId);
            next.create = withTenantData(next.create, tenantId);
            return query(next);
          }

          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const result = await query(args);
            const row = result as { tenantId?: string } | null;
            if (row && row.tenantId !== tenantId) {
              if (operation === 'findUniqueOrThrow') {
                throw new Error('CROSS_TENANT_DENIED');
              }
              return null;
            }
            return result;
          }

          next.where = andTenant(next.where, tenantId);
          return query(next);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;
