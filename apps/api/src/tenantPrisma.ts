import { Prisma, PrismaClient } from '@prisma/client';
import { notFound } from './errors.js';

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
  'CommentReaction',
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
  'GitHubInstallation',
  'ProjectRepo',
  'ProjectGithubSettings',
  'DevLink',
  'GitHubEventLog',
  'Automation',
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

async function ownsRow(model: Prisma.ModelName, where: unknown, tenantId: string): Promise<void> {
  if (model === 'Workspace') {
    const id = where && typeof where === 'object' && 'id' in where ? (where as { id?: string }).id : undefined;
    if (id !== tenantId) throw notFound();
    return;
  }
  const key = (model.charAt(0).toLowerCase() + model.slice(1)) as Uncapitalize<Prisma.ModelName>;
  const delegate = prisma[key] as unknown as {
    findUnique: (args: { where: unknown }) => Promise<{ tenantId?: string } | null>;
  };
  const existing = await delegate.findUnique({ where });
  if (!existing) return;
  if (existing.tenantId !== tenantId) throw notFound();
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
            if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
              await ownsRow('Workspace', (args as { where?: unknown }).where, tenantId);
              if (operation === 'upsert') next.create = withTenantData(next.create, tenantId);
              return query(next);
            }
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
          if (operation === 'update' || operation === 'delete') {
            await ownsRow(model as Prisma.ModelName, (args as { where?: unknown }).where, tenantId);
            return query(args);
          }
          if (operation === 'upsert') {
            await ownsRow(model as Prisma.ModelName, (args as { where?: unknown }).where, tenantId);
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
