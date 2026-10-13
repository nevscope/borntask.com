# Task Manager Build Plan

Oct 11, 2026 · @Scope

## Purpose and scope

Build a multi-tenant work tracker that replaces Asana for the team first, and can later host client workspaces or be resold. It is shaped around how we ship: typed tasks (idea, bug, improvement, feature) moving through a configurable workflow, role-aware projects, list and kanban views, search, Google Chat notifications and an MCP server so Claude can work in it.

**Goals**

- One place for every project's backlog, from first idea to deployed.
- Workflow stages that match our process and can change per project without code changes.
- Clear ownership: every task has a type, a section, a status, an assignee and (optionally) a due date.
- Fast to use: create a task in under 10 seconds, drag between stages, find any task by search in one step.
- Multi-tenant from day one: every record belongs to a tenant, so client workspaces need no rebuild.

**Non-goals for the MVP**

- Time tracking, budgets and invoicing (Scoro and WorkflowMax already cover these).
- Billing and self-serve tenant sign-up (tenants are created by us until we decide to resell).
- Native mobile apps (responsive web only).
- Asana feature parity: we build what the team uses, nothing else.

**Success criteria**

- The whole team works in it daily and Asana is switched off within 8 weeks of MVP launch.
- Every active project migrated, with no lost tasks or comments.
- No task sits in a stage longer than its agreed limit without being flagged.

## Users and roles

Use two separate layers of roles: a workspace role that controls what someone can administer, and a project role that describes what they do on that project. Keeping them apart means a developer on one project can be the business owner on another.

**Workspace roles** (one per user)

- **Owner:** tenant settings, can do everything.
- **Admin:** manages users, invitations, project templates, workflows and integrations.
- **Member:** creates projects and works in the ones they belong to.
- **Guest:** an external person (e.g. a client) who only sees the projects they are invited to; cannot create projects or see the member directory.
- **Viewer:** read-only access to projects they are added to.

**Project roles** (one or more per member, per project; the list is editable)

| Project role | Typical responsibility | Default permissions |
| --- | --- | --- |
| Project lead | Owns the project, its members and settings | Everything in the project |
| Business | Raises ideas, approves scope, signs off releases | Create tasks, move Idea to Approved, comment |
| Developer | Builds and fixes | Create tasks, move Approved through Ready for testing |
| Tester | Verifies work | Move Ready for testing to Testing, pass to Deployed or fail back to WIP |
| Observer | Follows progress | View and comment only |

Permissions are attached to workflow transitions (see the workflow section), not hard-coded to role names, so new roles such as Designer or Client reviewer can be added later without code changes.

**Invitations and sign-in**

- Admins (and project leads, for their own project) invite by email. The invite sets the tenant role, and optionally a project and project roles.
- The invite email carries a single-use token that expires after 7 days; admins can resend or revoke pending invites.
- The invitee signs in with Google or Microsoft. The account is matched on the invited email address, so a client on Microsoft 365 and our team on Google Workspace use the same flow.
- A person can belong to several tenants with one login and switch between them from the avatar menu.
- Optional per tenant: restrict sign-in to listed email domains, and auto-join users from our own domain without an invite.

## Core concepts and data model

A tenant holds users and projects; a project holds sections and tasks; every task has one type, one status from its project's workflow, and sits in one section. Every table except User carries tenant\_id, and every query is scoped by it. Status and section are independent: section answers "what area is this?", status answers "where is it in delivery?".

| Entity | Key fields | Notes |
| --- | --- | --- |
| Tenant | name, slug, allowed\_domains\[\], settings | Our company is tenant 1; clients or resale customers get their own |
| User | name, email, avatar, auth\_provider (google, microsoft), provider\_id | Global identity; one login across tenants |
| TenantMember | tenant\_id, user\_id, tenant\_role, is\_active | Owner, Admin, Member, Guest, Viewer; deactivate, never delete |
| Invitation | tenant\_id, email, tenant\_role, project\_id?, project\_role\_ids\[\], token\_hash, invited\_by, expires\_at, accepted\_at, revoked\_at | Store a hash of the token, never the token |
| Project | tenant\_id, name, key (e.g. WEB), description, colour, lead\_id, workflow\_id, archived\_at | Key prefixes task numbers: WEB-142 |
| ProjectMember | project\_id, user\_id, roles\[\] | A user can hold several project roles |
| ProjectRole | tenant\_id, name, colour | Editable list: Business, Developer, Tester, … |
| Section | project\_id, name, position | Ordered; tasks can be dragged between them |
| TaskType | tenant\_id, name, icon, colour | Idea, Bug, Improvement, Feature; editable |
| Workflow | tenant\_id, name, is\_default | Reusable across projects |
| WorkflowStatus | workflow\_id, name, category, position, wip\_limit | category = backlog, active, review, done |
| WorkflowTransition | from\_status\_id, to\_status\_id, allowed\_role\_ids\[\] | Empty roles = anyone can move it |
| Task | tenant\_id, project\_id, number, title, description, type\_id, status\_id, section\_id, assignee\_id, reporter\_id, priority, due\_date, start\_date, estimate, position, parent\_id, deleted\_at, deleted\_by | Soft delete; FULLTEXT index on title + description for search |
| Label | project\_id, name, colour | Free tagging, many-to-many with Task |
| Comment | task\_id, author\_id, body, mentions\[\], deleted\_at | @mentions notify |
| Attachment | task\_id, storage\_key, name, size, mime | Files on disk or S3-compatible storage |
| ActivityLog | tenant\_id, task\_id, actor\_id, actor\_type (user, mcp, import, automation), action, from, to, at | Every change, including who or what made it |
| SavedView | project\_id, owner\_id, name, layout (list, board), filters, sort, group\_by, is\_shared | Personal or shared |
| Notification | user\_id, task\_id, kind, read\_at | In-app; also fans out to Google Chat |
| ChatIntegration | tenant\_id, project\_id?, provider (google\_chat), webhook\_url (encrypted), events\[\] | One Google Chat space per project or per tenant |
| ApiToken | tenant\_id, user\_id, name, token\_hash, scopes\[\], last\_used\_at, revoked\_at | Personal tokens for the MCP server and scripts |
| ImportJob | tenant\_id, project\_id, file\_name, status, mapping, rows\_total, rows\_done, errors | Asana Excel import progress and error report |

Use a status *category* on every workflow status. Reports, "done" logic and cross-project views key off the category, so renaming or adding stages never breaks them.

## Configurable workflow

Ship one default workflow and make it data, not code: statuses, their order and who may move between them are rows in the database, so changing the flow is an admin task, not a release.

&#91;embedded content: default delivery workflow · 6 stages, 1 loop back\]

The failed-test loop back to WIP is a proposal; confirm it in the open decisions.

**Rules**

- Each status has a category (Backlog, Active, Review, Done). Reports and "is it finished?" logic use the category, never the status name.
- Each allowed move is a transition with an optional list of project roles. No roles listed means any project member can make the move.
- Admins and project leads can always override a transition; the override is recorded in the activity log.
- Optional WIP limit per status: the board column turns amber when exceeded rather than blocking the move.
- Moving into Done stamps a completed date; moving out clears it.
- Changing a live workflow asks where tasks in a removed status should go before saving.

**Side statuses in the default workflow:** **On hold** (category Backlog) can be reached from any stage before Deployed and returns to the stage it came from, remembered on the task. **Rejected** (category Done) lets declined ideas leave the board without being deleted. Both show as collapsible columns at the right of the board.

## Views and filtering

Every view is the same query engine with a different layout: one filter bar, one sort, one group-by, rendered as a list or a board. Build the engine once and the views come almost free.

**Views in the MVP**

- **List:** spreadsheet-like rows, grouped by section (default), status, type, assignee or due week. Inline edit of status, assignee, due date. Drag to reorder within a group.
- **Kanban board:** columns = workflow statuses by default; can switch columns to sections, types or assignees. Drag cards to change the column's field; blocked transitions show why.
- **My tasks:** everything assigned to me across all projects, grouped Overdue, Today, This week, Later.

**Filter fields**

Type, status, status category, section, assignee (including "me" and "unassigned"), reporter, project role of assignee, priority, labels, due date (overdue, this week, range, none), created and updated date, and free-text search on title and description.

**Saved views**

- Any filter + sort + group + layout combination can be saved with a name.
- Personal by default; the project lead can share it to the project tabs (e.g. "Bugs to test", "Business approvals").
- The current view state lives in the URL, so a filtered board can be shared as a link.

**Search**

- A global search box in the top bar (shortcut `/`) searches across every project the user can see in the current tenant.
- Typing a task key such as WEB-142 jumps straight to that task.
- Otherwise it matches title, description and comments using a MySQL FULLTEXT index, ranked by relevance and recency, with results grouped by project.
- Inside a project, the filter bar's text box runs the same search limited to that project, combined with the other filters.
- If the volume outgrows MySQL FULLTEXT (roughly tens of thousands of tasks with heavy comment search), move to Meilisearch behind the same API without changing the screens.

**Deleting tasks**

- Delete is a soft delete: the task and its subtasks move to the project's Trash with who deleted it and when.
- Allowed for the task's reporter, the project lead and admins; guests cannot delete.
- Trash keeps tasks for 30 days, then a nightly job removes them permanently along with their attachments.
- Restore puts the task back in its original section and status.
- Every delete and restore is written to the activity log and is undoable from the toast for 10 seconds.

**Later views:** calendar (by due date), timeline (start to due), and a cross-project portfolio list.

## Screen inventory

Eighteen screens cover the MVP; the four marked core are where the team spends most of its time and should be designed first.

| # | Screen | Purpose | Key components | Priority |
| --- | --- | --- | --- | --- |
| 1 | Sign in | Authenticate | Continue with Google, Continue with Microsoft | MVP |
| 2 | Accept invitation | Join a tenant or project | Who invited you, tenant and project name, sign-in buttons, expired or revoked state | MVP |
| 3 | App shell | Navigation frame for everything | Tenant switcher, left sidebar (My tasks, Projects, Favourites), top bar (search, quick-add, notifications, avatar) | Core |
| 4 | My tasks | Personal daily list | Groups Overdue / Today / This week / Later, project chip per row | Core |
| 5 | Search results | Find any task | Results grouped by project, matched text highlighted, type and status chips, filters | MVP |
| 6 | Projects index | Find and create projects | Projects with lead, member avatars, open task count, New project button | MVP |
| 7 | Create project (modal) | Set up a project | Name, key, description, colour, workflow template, initial sections, add or invite members with roles | MVP |
| 8 | Project list view | Work the backlog | View tabs, filter bar, grouped rows, inline edit, add task per section | Core |
| 9 | Project board view | Move work through stages | Columns per status with counts and WIP limits, collapsible On hold and Rejected columns, draggable cards | Core |
| 10 | Task detail (side drawer) | Read and edit one task | Title, type, status, section, assignee, due, priority, labels, description, subtasks, attachments, comments, activity, delete | Core |
| 11 | Project settings: members | Who is on the project | Member table with project roles, pending invites with resend and revoke, Invite button | MVP |
| 12 | Project settings: sections, types, trash | Structure and recovery | Reorderable sections, enabled task types, Trash list with restore | MVP |
| 13 | Project settings: Google Chat | Notify a Chat space | Webhook URL, events to send, Send test message | MVP |
| 14 | Import from Asana | Bring a project across | Upload .xlsx or .csv, column mapping, status and section mapping, preview, progress and error report | MVP |
| 15 | Workflow editor | Change the flow | Ordered statuses with category and WIP limit, transition matrix with allowed roles, remap tasks on removal | MVP |
| 16 | Tenant admin: people | Manage users and invites | Members with tenant roles, pending invitations, allowed domains | MVP |
| 17 | Tenant admin: defaults | Shared configuration | Project roles, task types, default workflows | MVP |
| 18 | Profile: API tokens | Connect Claude via MCP | Create token with scopes, copy once, last used, revoke, MCP setup instructions | MVP |

Global elements to design once: the filter bar, the quick-add task bar (shortcut Q), the command palette (Ctrl/Cmd K), confirm-delete with undo toast, empty states, and notifications. Ant Design 6 already provides most of these as components, so the design work is layout and states, not new widgets.

## Integrations and ideas

Three integrations are now in scope: Asana Excel import, Google Chat and an MCP server. All three run through the same API and permission checks as the web app, so none of them can bypass roles or tenant boundaries.

**Asana import (.xlsx or .csv)**

- Upload runs as a BullMQ job: parse the file, show a mapping screen, preview the first 20 rows, then import with live progress.
- Default mapping: Asana Section/Column to Section, Name to Title, Notes to Description, Assignee Email to Assignee, Due Date to Due date, Tags to Labels, Parent task to parent\_id, Completed At to the Deployed status. Asana columns differ by export, so the mapping screen always lets you correct this.
- Unknown assignees become pending invitations rather than failing the row.
- Re-running the same file updates tasks it already created (matched on the Asana Task ID column) instead of duplicating them.
- Comments and attachments are not in Asana's spreadsheet export; bringing them across needs the Asana API (a later option).

**Google Chat**

- Phase 1: incoming webhooks. An admin pastes a Chat space's webhook URL into project settings and picks events (task assigned, status changed, moved to Ready for testing, deployed, @mention). Messages are cards with a link back to the task. One-way, no Google Cloud setup.
- Later: a Google Chat app for two-way use (create a task from a message, slash commands, direct messages to the assignee). This needs a Google Cloud project and Chat API configuration in your Workspace.
- Clients on Microsoft can get the same events through a Teams incoming webhook later; design the notifier with a provider field from the start.

**MCP server**

- A separate app in the monorepo exposing tools such as `search_tasks`, `get_task`, `create_task`, `update_task`, `move_task`, `add_comment`, `list_projects`, `list_my_tasks`.
- Authenticates with a personal API token (screen 18), acts as that user, and logs every change with actor\_type = mcp.
- `move_task` goes through the same workflow transition check, so Claude cannot skip Testing if the user could not.
- Served over Streamable HTTP so Claude, Cursor and other clients can connect remotely.

**Further ideas, ranked by value for effort**

| Idea | Why it matters | Phase |
| --- | --- | --- |
| Task templates per type | A bug always gets steps to reproduce; a feature gets acceptance criteria | MVP |
| Rule-based automations | e.g. on Ready for testing, assign the project's Tester; on Deployed, notify Business | v1.1 |
| GitHub linking | Branches and PRs named WEB-142 link to the task and move it to WIP or Ready for testing | v1.1 |
| Release grouping and notes | Bundle tasks into a release; Deployed stamps the date; generate release notes | v1.1 |
| AI idea to spec | Turn a one-line idea into a feature with acceptance criteria and subtasks | v1.1 |
| AI triage | Suggest type, priority, section and likely duplicates on creation | v2 |
| Cycle-time report | Time spent per status and where work stalls (Recharts) | v2 |
| Client portal view | A simplified view for guests to approve ideas and test deployed items | v2 |

## Tech stack

Use the team's existing TypeScript monorepo pattern (the same one as kerd.ai), so Cursor rules, CI, Docker and deployment carry over. The rows marked *added* fill gaps this app has that the base stack does not cover.

**Repository layout** (npm workspaces, Node 22+)

```
apps/web      React 19 + Vite SPA
apps/api      Fastify 5 REST API
apps/worker   BullMQ jobs (import, notifications, purge, AI)
apps/mcp      MCP server (added)
packages/shared   Zod schemas and API contracts (@tasks/shared)
packages/db       Prisma schema, migrations, tenant-scoped client
```

| Layer | Choice | Use in this app |
| --- | --- | --- |
| Web | React 19, Vite, Ant Design 6, TanStack Query 5, React Router 7, dayjs | List view on AntD Table; board, drawer, filters on AntD components |
| Charts | Recharts | Cycle-time and workload reports (v2) |
| Drag and drop | dnd-kit (added) | Board cards, column reorder, list row reorder; AntD has no drag-and-drop |
| Rich text | Tiptap (added) | Task descriptions, comments, @mentions |
| API | Fastify 5 with cookies, CORS, multipart, secure sessions; Zod | All business logic; uploads via multipart |
| Sign-in | OAuth with Google and Microsoft Entra ID (added) | Entra's multi-tenant endpoint lets any client's Microsoft 365 account sign in |
| Email | Transactional email provider (added; to choose) | Invitations and notification digests |
| Realtime | Server-sent events from Fastify + Redis pub/sub (added) | Boards update live when someone else moves a card |
| Jobs | BullMQ on Redis | Asana import, Google Chat posts, trash purge, AI calls |
| AI | Google Generative AI behind a provider interface | Idea-to-spec and triage; swappable for Claude later |
| Data | MySQL via Prisma; Redis via ioredis | FULLTEXT indexes for search; Redis for queues, cache, sessions |
| Spreadsheets | exceljs + csv-parse (added) | Reading Asana .xlsx and .csv exports in the worker |
| MCP | @modelcontextprotocol/sdk (added) | Streamable HTTP transport, token auth |
| Files | Docker volume on the Plesk host, or S3-compatible storage | Attachments; choose before go-live |
| Infra | Docker Compose locally; Plesk + Docker in production | Containers: web, api, worker, mcp, mysql, redis |
| Quality | Playwright + axe, custom design:lint, plus Vitest (added) for unit and API tests | Includes cross-tenant access tests |

**Architecture rules worth fixing early**

- Tenant isolation lives in the application, because MySQL has no row-level security. Wrap Prisma in a client extension that injects tenant\_id into every query and refuses queries without one. Add tests that try to read another tenant's data and must fail.
- Status changes go through one service function, `moveTask()`, used by the API, the importer, automations and the MCP server alike. It checks the transition and the user's project roles, then writes the ActivityLog.
- Ordering uses fractional indexes (a string position between neighbours), so a drag writes one row, not the whole list.
- Every list, board and search reads from one shared query builder that takes a SavedView-shaped object defined in packages/shared.
- Secrets at rest (Chat webhook URLs, OAuth client secrets) are encrypted; API and invitation tokens are stored only as hashes.

## Phased roadmap

Ship in three phases, each usable on its own; the MVP must be good enough that the team stops opening Asana. Durations assume one developer working with Cursor part-time and are estimates to revisit after Phase 0. Reusing the kerd.ai scaffolding should shorten Phase 0.

**Phase 0: Foundations (about 1 to 2 weeks)**

- [ ] Monorepo scaffold, Docker Compose (MySQL, Redis), CI with typecheck, lint, Vitest and Playwright
- [ ] Prisma schema for every entity, migrations, seed data (default workflow with On hold and Rejected, task types, roles)
- [ ] Tenant-scoped Prisma client and cross-tenant tests
- [ ] Google and Microsoft sign-in, sessions, tenant switcher, app shell

**Phase 1: MVP (about 6 to 8 weeks)**

- [ ] Invitations: invite, accept, resend, revoke, expiry, email delivery
- [ ] Projects, members and project roles
- [ ] Sections and tasks: create, edit, assign, due date, type, priority, labels, subtasks, comments, attachments
- [ ] Soft delete, Trash, restore and 30-day purge job
- [ ] Workflow engine with role-gated transitions, On hold return, workflow editor
- [ ] List view, board view, filter bar, saved views, My tasks
- [ ] Global search and task-key jump
- [ ] Asana Excel import with mapping, preview and error report
- [ ] Google Chat notifications via webhooks
- [ ] API tokens and the MCP server with the core task tools

**Exit gate:** two real projects imported from Asana and run only in the new tool for two weeks, with Claude connected over MCP.

**Phase 2: v1.1 (about 4 weeks)**

- [ ] Automations, GitHub linking, releases and release notes
- [ ] Live board updates over server-sent events (if not pulled into the MVP)
- [ ] AI idea-to-spec on Idea tasks

**Phase 3: v2**

- [ ] Google Chat app (two-way), Teams notifications, AI triage, cycle-time reporting, calendar and timeline views, client portal view

## Cursor build guidelines

Cursor builds well when it gets a fixed spec, a rules file it reads on every request, and one small, testable slice at a time. Do not paste this whole plan and ask for "the app".

**1. Put the spec in the repo**

- `/docs/PRD.md`: purpose, roles, workflow and views sections from this doc.
- `/docs/DATA_MODEL.md`: the entity table, then the Prisma schema once generated.
- `/docs/SCREENS.md`: the screen inventory plus exported screen designs.
- `/docs/DECISIONS.md`: one line per decision as you make it (stack, ordering method, auth).

**2. Add a project rules file** (`.cursor/rules/` or `AGENTS.md`) covering:

- Stack and versions from the tech stack section; no new libraries without asking.
- Monorepo boundaries: apps import from packages, never from each other; every API request and response type comes from packages/shared Zod schemas.
- Every database access goes through the tenant-scoped Prisma client; raw Prisma is forbidden outside packages/db.
- Status changes only via `moveTask()`; deletes only via `softDeleteTask()`.
- Long or external work (imports, Chat posts, AI calls, purges) runs as BullMQ jobs in apps/worker, never inline in a request.
- UI uses Ant Design 6 components and tokens; no custom CSS frameworks. Run `design:lint` and the Playwright + axe checks.
- Before finishing a task: typecheck, lint, Vitest and Playwright pass, and `/docs/DECISIONS.md` is updated.

**3. Build in this order, one Cursor session per step**

1. Scaffold, Docker Compose, CI, Prisma schema, seed data, tenant-scoped client with cross-tenant tests.
2. Google and Microsoft sign-in, sessions, tenant switcher, app shell.
3. Invitations end to end, including email.
4. Projects index, create project, members and roles.
5. Sections and task CRUD with the task detail drawer, soft delete and Trash.
6. Workflow engine (`moveTask()` with transition, role and On hold rules), then the workflow editor.
7. Shared query builder, filter bar and search.
8. List view, then board view, then saved views and My tasks.
9. Asana import job and mapping screen.
10. Google Chat notifier.
11. API tokens and the MCP server, tested from Claude.

**4. Prompt shape for each step**

Give Cursor: the goal in one sentence, the relevant doc sections by file path, the screen design, explicit acceptance criteria, and what is out of scope. Ask it to propose a plan first, approve the plan, then let it write code.

## Open decisions and risks

**Decided**

- [x] Multi-tenant from day one.
- [x] Sign-in with Google and Microsoft; people join by email invitation.
- [x] On hold (and Rejected) in the default workflow.
- [x] Tasks can be deleted (soft delete with Trash).
- [x] Asana import from an Excel export.
- [x] Google Chat notifications, an MCP server and global search in the MVP.
- [x] Tech stack: the team's TypeScript monorepo with MySQL, Redis, Fastify and React.

**Still open**

- [ ] One workflow per project, or one per task type (e.g. bugs skip Idea and Approved)?
- [ ] Does a failed test send the task back to WIP automatically, or does the tester choose?
- [ ] Who may edit workflows: tenant admins only, or project leads too?
- [ ] Which email provider sends invitations, and from which domain?
- [ ] Attachments on the Plesk host's disk, or S3-compatible storage (easier backups and scaling)?
- [ ] Is live board updating needed in the MVP, or can it wait for v1.1?
- [ ] Product name and domain, so OAuth apps and invite emails can be registered.

**Risks**

- **Tenant data leaks:** with MySQL there is no database-level safety net; one unscoped query exposes another tenant's tasks. Mitigation: the scoped Prisma client, lint rule against raw Prisma, and cross-tenant tests in CI.
- **Microsoft sign-in for clients:** some client organisations block users from consenting to third-party apps, so their admin may need to approve the app once. Test with one client tenant early.
- **MVP scope has grown:** invitations, import, Chat, search and MCP add roughly 2 to 3 weeks to Phase 1. If speed matters more, MCP and Chat can slip to v1.1 without design changes.
- **Ongoing ownership:** an internal tool needs a named owner for bugs, upgrades and backups after launch, or it decays.
- **Workflow changes on live projects:** removing a status with tasks in it needs a remapping step, designed into the workflow editor from the start.
