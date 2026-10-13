# BornTask: requirement changes since the build plan

The **Task Manager Build Plan** (last edited 11 Oct 2026) is the baseline. Everything below changed afterwards, during screen design (11–13 Oct). **Where this file and the plan disagree, this file wins.** The screens in `docs/design/` show each change. The file to look at is named in brackets.

Source column: **Asked** = Scope asked for it directly. **Design** = decided while designing and reviewed on the canvas, but not explicitly requested. Treat Design items as defaults that can still change.

## 1. Biggest changes (read first)

| # | Area | Plan said | Now | Source |
|---|---|---|---|---|
| 1 | **Billing** | Non-goal for MVP; no self-serve sign-up | €1 per member per month, guests free, 14-day free trial with no card, self-serve workspace creation. Your own internal workspace is never billed. (`AdminBilling`, `SheetBillingStates`, `CreateWorkspace`) | Asked |
| 2 | **Idea approval** | Open question: one workflow per project or per type | Ideas, Improvements and Features start in **Idea** and need **Business** approval before work starts. **Bugs start in Approved** (workspace setting "Bugs start in", default Approved). (`SheetApprovals`, `WorkspaceGeneral`) | Asked (approval); Design (bug setting) |
| 3 | **GitHub** | v1.1 idea, one line | Full design: a GitHub App per organisation, repos per project, task-key linking, automatic forward moves, a Development section in the drawer, and card badges. **Phase still to confirm** (plan says v1.1). (`GitHubSettings`, `SheetGitHub`) | Asked (screens) |
| 4 | **MCP sign-in** | Personal API token only | Adds an **OAuth consent flow** ("Claude wants to connect", Read only or Read and update, pick workspace) and a Connected apps list. API tokens stay for scripts. (`McpConsent`, `McpConnected`, `ApiTokens`) | Asked (confirmation page) |
| 5 | **Drag and drop** | "Drag cards to change the column's field" | **List drag = order or section only. Board drag = status only**, with workflow rules applied live. (`SheetDragDrop`, `SheetFilters`) | Asked (question) → Design |
| 6 | **Guests can approve** | Client approvals in a v2 "client portal" | A guest can hold the Business role on a project and approve ideas in the MVP, with its own welcome screen. (`WelcomeGuest`, `AcceptInvite`) | Design |
| 7 | **Quality gates** | CI: typecheck, lint, Vitest, Playwright | **No ESLint, no Prettier.** Gates are `tsc` + `design:lint` (ported from kerd). Versions pinned to kerd, not latest. | Asked |

## 2. Workflow and permissions

| Change | Detail | Source |
|---|---|---|
| Approve / Reject on ideas | Business users see Approve and Reject… in the drawer, plus a **"Needs your approval"** group at the top of My tasks. Everyone else sees "Waiting for approval from <name>" and a Remind button (one reminder a day). | Asked → Design |
| Reject needs a reason | The reason is shared with the reporter, and the task moves to Rejected. | Design |
| Approval nudges | Ideas waiting more than 5 working days show "Waiting N days" in amber and appear in the daily digest. Approving notifies the reporter and the project's developers. | Design |
| Failed test | **Resolved open decision:** the tester chooses **Fail → WIP**, and a comment is required. | Design |
| Transitions carry options | Each move has: allowed roles, **ask for a comment**, notify the assignee, notify a role. (`SheetWorkflow`) | Design |
| Blocked move | Dropping on a blocked column shows "Only <role> can move tasks to <stage>" with **Ask <role>** (posts an @mention comment) and **Override…**. | Design |
| Override | Owner, admin or project lead only, **reason required**, logged. The plan had override with no reason. | Design |
| Two workflow templates | **Delivery** (Idea → Deployed + On hold + Rejected) and **Simple** (To do → Doing → Done, anyone moves). Chosen when creating a workspace or project. | Design |
| Bulk "Move to" | Only offers stages allowed for **every** selected task. (`SheetTopBar`) | Design |
| Keyboard moves | Alt ↑/↓ reorders, S changes status (same rules), M moves to a section. Every move is announced for screen readers. | Design |

## 3. Tasks, quick add and the drawer

| Change | Detail | Source |
|---|---|---|
| Quick add is a full modal | Type switcher; one-line title that parses `@person`, `!priority` and dates (`today`, `fri`, `next week`); shows the project and section and **which status it will start in**. Enter creates; Shift+Enter creates and opens. Press **Q** anywhere. (`QuickAdd`) | Asked (where to type) |
| Description templates per type | Bug: steps, expected, actual. Feature: acceptance criteria. Idea: problem, who benefits. Improvement: today, proposed. The template swaps when the type changes, unless the user has already typed. Already MVP in the plan, now specified. | Asked → Design |
| Attachments on create | Paste a screenshot (Ctrl V), drop files, or attach. **Up to 25 MB each.** | Asked |
| Drawer autosaves | Edit any field in place; "Saving… / ✓ Saved" in the header. The drawer opens from the URL `?task=WEB-142`. A "You can:" row shows quick-action buttons for the moves allowed to this user. | Asked (easy editing) |
| Delete behaviour | A single task: no dialog, just an **Undo** toast. A task with subtasks, or several tasks: a confirm dialog naming the people who will be told. | Design |
| My tasks tabs | **Assigned to me / Created by me / Watching**. Watching is new, so a watchers table is needed. (`Main`) | Design |

## 4. Projects, sections and people

| Change | Detail | Source |
|---|---|---|
| Creating sections | Set initial sections in **Create project**. Later: **Project settings → Sections, types and trash** to add, rename and drag to reorder. Deleting a section asks where its tasks go. (`CreateProject`, `ProjectStructure`, `SheetModals`) | Asked (question) → Design |
| "+" invite on the project header | A dashed "+" next to the member avatars opens **Invite people**. | Asked |
| Invite modal | Several emails at once; workspace role; optional project and project roles; optional message. An **external email automatically becomes a Guest** limited to that project. Invites expire after 7 days. | Design |
| Who can invite guests | Workspace setting "Members can invite guests" (otherwise only admins and leads). | Design |
| Wrong account | The person signed in with a different email from the one invited sees a screen to switch account or ask for an invite to that address (the inviter approves). (`WrongAccount`) | Design |
| Expired invite | "Ask for a new invitation" notifies the inviter. | Design |
| After accepting an invite | **Member** → My tasks empty state plus "Projects you can open". **Guest** → their project's welcome card explaining their role, then items waiting for approval. (`WelcomeMember`, `WelcomeGuest`) | Asked |
| Remove a member | Their open tasks become unassigned; comments and history stay. | Design |
| Projects index | Active / Archived tabs, plus an "Import from Asana" entry point. | Design |
| Import: unknown people | New emails are invited as **Member** (shown on the mapping step, can be changed). | Design |
| No access | A "You're not on this project" screen with Request access. | Design |

## 5. Billing and workspaces (new)

| Item | Detail |
|---|---|
| Price | €1 per member per month, billed monthly, plus VAT. **Owners, admins, members and viewers count; guests are free.** |
| Proration | People added mid-month are charged for the days left; people removed are credited on the next invoice. Owners and admins see the price change inside Invite people; members inviting guests don't see prices. |
| Trial | 14 days, no card needed. A banner shows days left and the projected monthly cost. |
| Payment failed | Banner, retry after 3 days. **14 days overdue → read-only** (everyone can view and export; nobody edits). |
| Cancel | Fully usable until the end of the paid month, then read-only for 30 days for export, then deleted. |
| Card and invoices | Card held by the payment provider (**provider not chosen**). Company details, VAT number, invoice email, invoice PDFs. Visible to owners only. |
| Create workspace | 3 steps: workspace (name, **web address `<name>.borntask.com`**, workflow template, domain auto-join) → invite team → first project. |
| Workspace settings | Logo, name, web address, time zone, week start, default workflow, **Bugs start in**, allow Google / Microsoft sign-in, members can invite guests, delete workspace (30-day delay, type the name to confirm). |

## 6. Integrations

| Change | Detail | Source |
|---|---|---|
| Google Chat (MVP unchanged: webhooks) | Adds a 3-step setup guide, a test message with an error state, and events including **"A new idea is created"** and "Any status change". | Asked |
| Google Chat app (v2, designed) | Direct message with Approve / Reject for ideas, the `/borntask bug WEB …` slash command, and "Create BornTask task" from any message. Still **v2**: it needs a Google Cloud project. | Asked → Design |
| GitHub details | Any branch, PR title or commit containing `WEB-142` links to that task. Suggested branch name `bug/WEB-142-checkout-fails-on-safari-17`. **Automatic moves go forward only and never into Testing or Deployed**; they skip role checks and are logged "via GitHub". Copy branch name can also assign to me and move to WIP. | Design |
| MCP access levels | Read only, or Read and update. MCP **can't** delete tasks, change settings or invite people. Follows the user's workflow rules. Logged "via Claude" / "via MCP". Server URL `https://[mcp-host].borntask.com/mcp`; tokens prefixed `bt_pat_`. | Design |

## 7. Notifications, global UI and states

| Change | Detail | Source |
|---|---|---|
| Notification preferences | Per event × channel: In app / Email / Google Chat (the Chat column is greyed out until the v2 Chat app). (`ProfileSettings`) | Design |
| Daily digest | 08:00 on workdays (or every day, or off): due items and mentions. Sender `BornTask <notify@borntask.com>`; HTML plus plain text. (`SheetEmails`) | Design |
| Top bar | Notifications bell, workspace switcher, avatar menu, keyboard-shortcut sheet (`?`), **command palette (Ctrl/Cmd K)**. Sidebar has Favourites. | Design |
| States | Loading skeleton only after 300 ms (no spinners); "Save failed · retrying"; **"Someone else changed it" → Show latest**; **offline: changes saved locally and synced on reconnect**. (`SheetStates`) | Design |
| Phone width | Under 768 px: bottom bar, two-line rows, full-screen drawer, board shows one swipeable column at a time, big Pass / Fail buttons. (`SheetMobile`) | Design |
| Brand | Name BornTask, final logo (A4), brand green #178A5C, DM Sans + Sora. Tokens are in `src/theme/tokens.ts`. | Asked |

## 8. Data model additions (not in the plan's entity table)

- **Workspace:** `slug` (subdomain), `logo`, `time_zone`, `week_start`, `default_workflow_id`, `bugs_start_in` (`approved` | `idea`), `allow_google`, `allow_microsoft`, `members_can_invite_guests`, `deleted_at`, `is_internal` (never billed).
- **Task:** `previous_status_id` (On hold return), `watchers` (new TaskWatcher table).
- **WorkflowTransition:** `require_comment`, `label`, `notify_assignee`, `notify_role_id`.
- **Subscription / Invoice:** status (`trialing`, `active`, `past_due`, `read_only`, `cancelled`), `trial_ends_at`, `paid_through`, provider ids, seat counts, VAT number, billing email.
- **OAuth for MCP:** OAuthClient, OAuthGrant / ConnectedApp (`app_name`, `redirect_host`, `scope`: `read` | `read_write`, `last_used_at`, `revoked_at`).
- **GitHub:** GitHubInstallation (org), ProjectRepo, and DevLink (task ↔ branch / PR / commit, PR state, checks).
- **NotificationPreference:** (user, event, channel), plus a digest schedule.
- **InviteRequest / AccessRequest:** wrong-account and no-access requests.
- **Attachment:** 25 MB per-file limit.
- **ActivityLog `via`:** `app`, `mcp`, `github`, `import` (plus the plan's `automation`).

## 9. Still open (decide before building that part)

- GitHub: MVP or v1.1?
- Payment provider (card + VAT invoices).
- Email provider (sender designed as `notify@borntask.com`).
- Attachment storage: Plesk disk or S3-compatible.
- Offline editing: the states sheet shows it, but it is a large feature. Recommend v1.1, with MVP only showing an "offline, changes not saved" banner.
- Who may edit workflows: admins only, or project leads too.
- Live board updates (SSE) in MVP or v1.1.
