# Data model

Every table except `User` carries `tenantId` (workspace id). Queries go through the tenant-scoped Prisma helper (`prisma/tenantClient.ts`). Raw unscoped Prisma is allowed only in auth, seed, platform jobs and isolation tests.

GitHub (`GitHubInstallation`, `ProjectRepo`, `DevLink`) and billing (`Subscription`, `Invoice`) tables are **deferred** to v1.2. Workspace still has `isInternal` so billing can skip the home workspace later.

## Entities (dogfood)

| Entity | Key fields | Notes |
| --- | --- | --- |
| User | name, email, avatar, authProvider, providerId | Global identity |
| Workspace | name, slug, logo, timeZone, weekStart, defaultWorkflowId, bugsStartIn, allowGoogle, allowMicrosoft, membersCanInviteGuests, deletedAt, isInternal, allowedDomains | Tenant. Slug is the subdomain |
| TenantMember | tenantId, userId, tenantRole, isActive | owner / admin / member / guest / viewer |
| Invitation | email, tenantRole, projectId?, tokenHash, expiresAt, acceptedAt, revokedAt | Hash only; 7 days |
| InviteRequest | invitedEmail, signedInEmail, inviterId | Wrong-account flow |
| AccessRequest | projectId, requesterId | No-access screen |
| Project | name, key, description, colour, leadId, workflowId, archivedAt | Key prefixes WEB-142 |
| ProjectMember | projectId, userId | |
| ProjectRole | name, slug, colour | Editable list per tenant |
| ProjectMemberRole | memberId, roleId | Several roles per member |
| Section | projectId, name, position | Ordered |
| TaskType | name, slug, icon, colour | idea, bug, improvement, feature |
| Workflow | name, slug, isDefault | Delivery / Simple templates |
| WorkflowStatus | name, slug, category, position, wipLimit | category: backlog / active / review / done |
| WorkflowTransition | fromStatusId, toStatusId, allowedRoleIds, requireComment, label, notifyAssignee, notifyRoleId | Empty roles = anyone |
| Task | number, title, description, typeId, statusId, previousStatusId, sectionId, assigneeId, reporterId, priority, dueDate, startDate, estimate, position, parentId, completedAt, deletedAt | FULLTEXT title+description |
| TaskWatcher | taskId, userId | Watching tab |
| Label | projectId, name, colour | |
| Comment | taskId, authorId, body, mentions | Soft delete |
| Attachment | taskId, storageKey, name, size, mime | 25 MB app limit |
| ActivityLog | taskId, actorId, actorType, via, action, from, to | via: app / mcp / github / import / automation |
| SavedView | projectId, ownerId, name, layout, filters, sort, groupBy, isShared | |
| Favourite | userId, projectId | Sidebar |
| Notification | userId, taskId, kind, readAt | |
| NotificationPreference | userId, event, channel, enabled | plus digestHour / digestMode on User or prefs |
| DigestPreference | userId, mode, hour | workdays / daily / off |
| ChatIntegration | projectId?, provider, webhookUrlEnc, events | Google Chat webhooks |
| ApiToken | userId, name, tokenHash, scopes, lastUsedAt, revokedAt | `bt_pat_` prefix on plaintext |
| OAuthClient | name, redirectHosts | MCP apps |
| OAuthGrant | clientId, userId, scope, lastUsedAt, revokedAt | read / read_write |
| ImportJob | projectId, fileName, status, mapping, rowsTotal, rowsDone, errors | Asana Excel |

## Start-status rule

`Workspace.bugsStartIn` is `approved` or `idea`. Other types always start in Idea on Delivery workflows. Simple workflows start in To do.

## Prisma

Canonical schema: [`prisma/schema.prisma`](../prisma/schema.prisma). Seed: [`prisma/seed.ts`](../prisma/seed.ts).
