// API contract for BornTask (proposed). These Zod schemas are the single source of truth for
// the web app today; move them to @borntask/shared when the monorepo is ready so the
// Fastify API validates against exactly the same shapes.
import { taskDescriptionSchema } from '@borntask/shared';
import { z } from 'zod';

// ---------- enums ----------
export const WorkBreakdownSchema = z.enum(['off', 'stories', 'epics_stories']);
export type WorkBreakdown = z.infer<typeof WorkBreakdownSchema>;

export const BuiltinTaskTypeSchema = z.enum(['idea', 'bug', 'improvement', 'feature', 'story', 'epic']);
export type BuiltinTaskType = z.infer<typeof BuiltinTaskTypeSchema>;
export const TaskTypeSchema = z.string().min(1);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const PrioritySchema = z.enum(['urgent', 'high', 'medium', 'low', 'none']);
export type Priority = z.infer<typeof PrioritySchema>;

export const BuiltinProjectRoleSchema = z.enum(['lead', 'business', 'developer', 'tester', 'observer']);
export type BuiltinProjectRole = z.infer<typeof BuiltinProjectRoleSchema>;
export const ProjectRoleSchema = z.string().min(1);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

export const WorkspaceRoleSchema = z.enum(['owner', 'admin', 'member', 'guest', 'viewer']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const StatusCategorySchema = z.enum(['backlog', 'active', 'review', 'done']);
export type StatusCategory = z.infer<typeof StatusCategorySchema>;

export const StatusToneSchema = z.enum(['neutral', 'indigo', 'blue', 'amber', 'orange', 'green', 'slate']);
export type StatusTone = z.infer<typeof StatusToneSchema>;

/** Who made a change: the app itself, Claude/Cursor over MCP, GitHub automation or the Asana import. */
export const ActorViaSchema = z.enum(['app', 'mcp', 'github', 'import', 'automation']);
export type ActorVia = z.infer<typeof ActorViaSchema>;

// ---------- people and workspace ----------
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  initials: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const MeSchema = z.object({
  user: UserSchema,
  workspace: z.object({ id: z.string(), name: z.string(), slug: z.string().optional(), logo: z.boolean().optional() }),
  workspaceRole: WorkspaceRoleSchema,
  workspaces: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        role: WorkspaceRoleSchema,
        logo: z.boolean().optional(),
      }),
    )
    .optional(),
});
export type Me = z.infer<typeof MeSchema>;

// ---------- workflow ----------
export const WorkflowStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: StatusCategorySchema,
  tone: StatusToneSchema,
  colour: z.string().optional(),
  position: z.number(),
  wipLimit: z.number().int().nullable(),
  /** Side statuses (On hold, Rejected) render as collapsible columns at the end of the board. */
  side: z.boolean(),
  /** Open tasks currently in this stage. Present on workflow editor payloads. */
  taskCount: z.number().int().optional(),
});
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const TransitionSchema = z.object({
  /** A status id, or '*' for "from any status that is not in the done category". */
  from: z.string(),
  to: z.string(),
  /** Project roles allowed to make this move. Empty = any project member. */
  roles: z.array(ProjectRoleSchema),
  requireComment: z.boolean(),
  /** Short action label used for quick buttons, e.g. "Pass", "Fail", "Approve". */
  label: z.string().nullable(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  statuses: z.array(WorkflowStatusSchema),
  transitions: z.array(TransitionSchema),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// ---------- projects ----------
export const StatusCountsSchema = z.object({
  backlog: z.number().int(),
  active: z.number().int(),
  review: z.number().int(),
  done: z.number().int(),
});
export type StatusCounts = z.infer<typeof StatusCountsSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  color: z.string(),
  leadId: z.string(),
  workflowId: z.string(),
  openCount: z.number().int(),
  counts: StatusCountsSchema,
  starred: z.boolean(),
  leadName: z.string().nullable().optional(),
  guestCount: z.number().int().optional(),
  updatedAt: z.string().optional(),
  archived: z.boolean().optional(),
  /** False when an admin can see the project but has not been given a seat. */
  canOpen: z.boolean().optional(),
  accessRequested: z.boolean().optional(),
  pendingInvite: z.boolean().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const SectionSchema = z.object({
  id: z.string(),
  projectKey: z.string(),
  name: z.string(),
  position: z.number(),
});
export type Section = z.infer<typeof SectionSchema>;

export const ProjectMemberSchema = z.object({
  userId: z.string(),
  roles: z.array(ProjectRoleSchema),
  workspaceRole: WorkspaceRoleSchema.optional(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const ProjectDetailSchema = z.object({
  project: ProjectSchema,
  sections: z.array(SectionSchema),
  members: z.array(ProjectMemberSchema),
  users: z.array(UserSchema),
  workflow: WorkflowSchema,
  disabledTypes: z.array(z.string()).optional(),
  workBreakdown: WorkBreakdownSchema.optional(),
  storiesNeedApproval: z.boolean().optional(),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

// ---------- tasks ----------
export const TaskSchema = z.object({
  id: z.string(),
  key: z.string(),
  projectKey: z.string(),
  title: z.string(),
  description: z.string(),
  type: TaskTypeSchema,
  statusId: z.string(),
  /** Set while On hold so the task can return to where it was. */
  previousStatusId: z.string().nullable(),
  sectionId: z.string(),
  assigneeId: z.string().nullable(),
  reporterId: z.string(),
  priority: PrioritySchema,
  /** Calendar date, YYYY-MM-DD. */
  dueDate: z.string().nullable(),
  labels: z.array(z.string()),
  /** Order within its section. The API should use fractional-index strings; a float is enough for the mock. */
  position: z.number(),
  subtaskCount: z.object({ done: z.number().int(), total: z.number().int() }),
  commentCount: z.number().int(),
  attachmentCount: z.number().int(),
  lastComment: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedByName: z.string().nullable().optional(),
  daysLeft: z.number().int().nullable().optional(),
  githubBadge: z.enum(['pr_running', 'pr_passed', 'pr_failed', 'merged', 'branch']).nullable().optional(),
  planningParentId: z.string().nullable().optional(),
  planningParentKey: z.string().nullable().optional(),
  planningParentTitle: z.string().nullable().optional(),
  planningChildCount: z.object({ done: z.number().int(), total: z.number().int() }).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const SubtaskSchema = z.object({ id: z.string(), title: z.string(), done: z.boolean() });
export type Subtask = z.infer<typeof SubtaskSchema>;

export const CommentReactionKindSchema = z.enum(['like', 'love', 'yes', 'seen', 'celebrate']);
export type CommentReactionKind = z.infer<typeof CommentReactionKindSchema>;

export const CommentReactionGroupSchema = z.object({
  emoji: CommentReactionKindSchema,
  userIds: z.array(z.string()),
});
export type CommentReactionGroup = z.infer<typeof CommentReactionGroupSchema>;

export const CommentSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  parentId: z.string().nullable().optional(),
  body: z.string(),
  via: ActorViaSchema,
  createdAt: z.string(),
  reactions: z.array(CommentReactionGroupSchema),
});
export type Comment = z.infer<typeof CommentSchema>;

export const ActivitySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  via: ActorViaSchema,
  text: z.string(),
  at: z.string(),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const DevLinkSchema = z.object({
  id: z.string(),
  kind: z.enum(['branch', 'pr', 'commit']),
  title: z.string(),
  url: z.string(),
  repo: z.string(),
  author: z.string(),
  prState: z.string().nullable(),
  checks: z.enum(['pending', 'running', 'passed', 'failed']).nullable(),
  extra: z.string(),
  ref: z.string().optional(),
});
export type DevLink = z.infer<typeof DevLinkSchema>;

export const TaskDevelopmentSchema = z.object({
  enabled: z.boolean(),
  suggestedBranch: z.string(),
  gitCheckout: z.string(),
  links: z.array(DevLinkSchema),
  githubActivity: z.array(z.object({ when: z.string(), text: z.string() })),
});
export type TaskDevelopment = z.infer<typeof TaskDevelopmentSchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  mime: z.string(),
  url: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const TaskDetailSchema = TaskSchema.extend({
  subtasks: z.array(SubtaskSchema),
  comments: z.array(CommentSchema),
  activity: z.array(ActivitySchema),
  watcherIds: z.array(z.string()).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  /** Set while the task is still in the 30-day trash window. */
  deletedAt: z.string().nullable().optional(),
  development: TaskDevelopmentSchema.optional(),
  planningChildren: z.array(z.object({ key: z.string(), title: z.string(), type: TaskTypeSchema })).optional(),
});

export const SearchHitSchema = z.object({
  key: z.string(),
  projectKey: z.string(),
  projectName: z.string(),
  projectColor: z.string(),
  title: z.string(),
  type: TaskTypeSchema,
  statusId: z.string(),
  statusName: z.string(),
  statusTone: StatusToneSchema,
  statusCategory: StatusCategorySchema,
  sectionName: z.string().nullable(),
  assigneeName: z.string().nullable(),
  matchField: z.enum(['title', 'description', 'comment', 'key']),
  matchSnippet: z.string(),
  commentAuthor: z.string().nullable(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResponseSchema = z.object({
  hits: z.array(SearchHitSchema),
  tookMs: z.number(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type TaskDetail = z.infer<typeof TaskDetailSchema>;

export const NotificationKindSchema = z.enum(['mention', 'assigned', 'moved', 'invite', 'github', 'access_request']);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  kind: NotificationKindSchema,
  text: z.string(),
  taskKey: z.string().nullable(),
  projectKey: z.string().nullable(),
  needsAccept: z.boolean().optional(),
  actor: UserSchema.nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number().int(),
});
export type NotificationList = z.infer<typeof NotificationListSchema>;

export const MyTasksSchema = z.object({
  assigned: z.array(TaskSchema),
  /** Ideas waiting for a decision from someone with the Business role (that's me). */
  approvals: z.array(TaskSchema),
  created: z.array(TaskSchema).optional(),
  watching: z.array(TaskSchema).optional(),
});
export type MyTasks = z.infer<typeof MyTasksSchema>;

// ---------- inputs ----------
export const CreateTaskInputSchema = z.object({
  projectKey: z.string(),
  sectionId: z.string(),
  type: TaskTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: taskDescriptionSchema,
  assigneeId: z.string().nullable(),
  priority: PrioritySchema,
  dueDate: z.string().nullable(),
  labels: z.array(z.string()),
  /** Ids returned by the upload endpoint; attached when the task is created. */
  attachmentIds: z.array(z.string()),
  planningParentId: z.string().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: taskDescriptionSchema,
    type: TaskTypeSchema,
    assigneeId: z.string().nullable(),
    priority: PrioritySchema,
    dueDate: z.string().nullable(),
    labels: z.array(z.string()),
    sectionId: z.string(),
    planningParentId: z.string().nullable(),
  })
  .partial();
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const MoveTaskInputSchema = z.object({
  toStatusId: z.string(),
  comment: z.string().optional(),
  /** Only accepted from project leads and workspace owners/admins; logged. */
  overrideReason: z.string().optional(),
  undo: z.boolean().optional(),
});
export type MoveTaskInput = z.infer<typeof MoveTaskInputSchema>;

export const MoveTaskToProjectInputSchema = z.object({
  projectKey: z.string().min(1),
  sectionId: z.string().optional(),
});
export type MoveTaskToProjectInput = z.infer<typeof MoveTaskToProjectInputSchema>;

export const ReorderTaskInputSchema = z.object({
  sectionId: z.string(),
  /** Place before this task; null = end of the section. */
  beforeKey: z.string().nullable(),
});
export type ReorderTaskInput = z.infer<typeof ReorderTaskInputSchema>;

// ---------- errors ----------
export const ApiErrorCodeSchema = z.enum([
  'TRANSITION_NOT_ALLOWED',
  'COMMENT_REQUIRED',
  'NOT_FOUND',
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'SERVER',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
  allowedRoles: z.array(ProjectRoleSchema).optional(),
});

// ---------- the client contract ----------
// Both the mock (mockData.ts) and the real client (http.ts) implement this interface.
// Proposed REST routes are noted next to each method.
export interface Api {
  getMe(): Promise<Me>; // GET /me
  listProjects(): Promise<Project[]>; // GET /projects
  setFavourite(key: string, starred: boolean): Promise<{ ok: boolean }>; // POST or DELETE /projects/:key/favourite
  getProject(key: string): Promise<ProjectDetail>; // GET /projects/:key
  listProjectTasks(key: string): Promise<Task[]>; // GET /projects/:key/tasks
  listMyTasks(): Promise<MyTasks>; // GET /me/tasks
  search(q: string): Promise<SearchResponse>; // GET /search?q=
  getTask(key: string): Promise<TaskDetail>; // GET /tasks/:key
  createTask(input: CreateTaskInput): Promise<Task>; // POST /projects/:projectKey/tasks
  updateTask(key: string, input: UpdateTaskInput): Promise<Task>; // PATCH /tasks/:key
  moveTask(key: string, input: MoveTaskInput): Promise<Task>; // POST /tasks/:key/move  (403 TRANSITION_NOT_ALLOWED)
  moveTaskToProject(key: string, input: MoveTaskToProjectInput): Promise<Task>; // POST /tasks/:key/move-project
  reorderTask(key: string, input: ReorderTaskInput): Promise<Task>; // POST /tasks/:key/reorder
  copyTask(key: string): Promise<Task>; // POST /tasks/:key/copy
  addComment(key: string, body: string, parentId?: string): Promise<Comment>; // POST /tasks/:key/comments
  updateComment(key: string, commentId: string, body: string): Promise<Comment>; // PATCH /tasks/:key/comments/:id
  deleteComment(key: string, commentId: string): Promise<void>; // DELETE /tasks/:key/comments/:id
  toggleCommentReaction(key: string, commentId: string, emoji: CommentReactionKind): Promise<Comment>; // POST /tasks/:key/comments/:id/reactions
  addSubtask(key: string, title: string): Promise<Subtask>; // POST /tasks/:key/subtasks
  setSubtaskDone(key: string, subtaskId: string, done: boolean): Promise<Subtask>; // PATCH /tasks/:key/subtasks/:id
  deleteTask(key: string): Promise<void>; // DELETE /tasks/:key  (soft delete → Trash)
  restoreTask(key: string): Promise<Task>; // POST /tasks/:key/restore
  setWatching(key: string, watch: boolean): Promise<{ ok: boolean }>; // POST /tasks/:key/watchers
  listNotifications(): Promise<NotificationList>; // GET /me/notifications
  markNotificationsRead(input: { id?: string; all?: boolean }): Promise<NotificationList>; // POST /me/notifications/read
}
