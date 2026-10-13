# BornTask product requirements

BornTask (borntask.com, app at app.borntask.com) is a multi-tenant work tracker that replaces Asana for the team first and can later host client workspaces. **REQUIREMENT-CHANGES.md wins** where it disagrees with *Task Manager Build Plan.md*. Interaction and API contract live in `apps/web/CURSOR.md` and `apps/web/docs/design/`.

## Purpose

- One place for every project's backlog, from first idea to deployed.
- Workflow stages that match how we ship and can change per project without a release.
- Clear ownership: type, section, status, assignee, optional due date.
- Fast: create a task in under 10 seconds; find any task by search in one step.
- Multi-tenant from day one: every business row belongs to a workspace (tenant).

## Goals and non-goals (dogfood)

**Goals:** typed tasks (idea, bug, improvement, feature); configurable workflow; role-aware projects; list and board; search; later Google Chat webhooks and MCP.

**Out of dogfood:** time tracking and client invoicing (Scoro / WorkflowMax); native mobile apps; Asana feature parity; **billing charges** (designed, ships after v1.2); **GitHub App** (designed, ships v1.2); two-way Google Chat app (v2); full offline sync (v1.1); live board SSE (v1.1).

**Success:** the team works in BornTask daily and Asana is off within eight weeks of MVP; every active project migrated; no task sits in a stage longer than its limit without a flag.

## Roles

Two layers: workspace role (what someone can administer) and project role (what they do on a project).

**Workspace:** Owner, Admin, Member, Guest, Viewer.

**Project (editable list):** Project lead, Business, Developer, Tester, Observer. Permissions attach to workflow transitions, not hard-coded role names.

Guests may hold the Business role and approve ideas in the MVP (`WelcomeGuest`). External invite emails become Guest and are limited to the named project.

## Idea approval

Ideas, Improvements and Features start in **Idea** and need **Business** approval before work starts. **Bugs start in** a workspace setting (`bugs_start_in`), default **Approved**. Business users see Approve and Reject in the drawer. Reject requires a reason and moves the task to Rejected. My tasks shows a **Needs your approval** group. Waiting more than 5 working days is flagged in the digest.

## Workflow

Two templates, chosen when creating a workspace or project:

| Template | Stages |
| --- | --- |
| **Delivery** | Idea → Approved → WIP → Ready for testing → Testing → Deployed, plus On hold and Rejected |
| **Simple** | To do → Doing → Done (anyone may move) |

Transitions carry: allowed roles (empty = any project member), require comment, notify assignee, notify a role, label. Failed test: tester chooses **Fail → WIP** and a comment is required. On hold remembers `previous_status_id`. Override: owner, admin or project lead, **reason required**, logged. Workflow **editor** is owner/admin only.

**Drag:** list drag changes order or section only. Board drag changes status only, with live rules.

## Views

List, board, My tasks (**Assigned to me / Created by me / Watching**, plus approvals group). Shared filter/sort/group engine. Global search and task-key jump (`WEB-142`). Command palette (Ctrl/Cmd K). Favourites in the sidebar.

## Billing (designed, not built this phase)

€1 per member per month; guests free; 14-day trial, no card; `is_internal` workspaces never billed. Self-serve workspace creation is designed (`<slug>.borntask.com`). Payment provider: Stripe when Stage 12 starts.

## Brand

Name BornTask. Brand green `#178A5C`. Fonts DM Sans (UI) and Sora (display). Tokens: `apps/web/src/theme/tokens.ts`.
