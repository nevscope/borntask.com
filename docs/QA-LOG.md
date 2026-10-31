# QA log - 14 Oct 2026

App: http://localhost:5174  
Dev-login: `owner@borntask.com` / BornTask Owner  
Compared against `apps/web/docs/design/*.dc.html` in the Cursor browser (narrow pane, ~390px).  
Did not rebuild My tasks, List, Board, drawer, or Quick add. Did not start Chat, MCP, billing, GitHub, or Plesk.

Gates after the morning fixes: `npm run typecheck -w @borntask/web` passed.

Evening tour: `apps/web/.env` now has `VITE_MOCK_PROJECTS=false` and `VITE_MOCK_TASKS=false`. Vite was restarted. API was already on 3010. Worker was started for import. Signed in as `owner@borntask.com`.

| ID | Flow / screen | Severity | Finding | Fixed | Leftover |
|---|---|---|---|---|---|
| QA-01 | Sign in (`SignIn.dc.html`) | P1 | Green hero filled the first screen; form sat below the fold. Failed `/auth/dev-login` (API down) still navigated home via mocks. | Y | Stacked layout on narrow viewports vs 1440 side-by-side spec. Dev-login fields are extra vs production OAuth-only spec. |
| QA-02 | Sign in compile | P0 | Sign-in edit left invalid JSX (`{error && …}` next to `<Form>`). Vite overlay crash. | Y | - |
| QA-03 | Sign in API | P1 | API was not running on 3010; MySQL/Redis were up. Started `npm run dev:api`. | Y | API is a separate process; if it stops, sign-in shows the new error instead of a silent mock home. |
| QA-04 | Sign in (retest) | - | After API + layout fix: inverted logo, form visible, login lands on workspace **BornTask**, avatar BO. | - | Hero still stacks above the form on a phone-width pane. |
| QA-05 | Search (`Search.dc.html`) | P0 | Not broken on mocks. `checkout` grouped hits, chips, filters, query kept in the top bar. | n/a | Y. Placeholder is "Search tasks or jump to a task key". Live `checkout` is WEB-1. |
| QA-06 | Search heading | P1 | Heading flashed `0 results for "checkout"` while the query was in flight. | Y | - |
| QA-07 | Search snippet | P2 | Mock description snippet started mid-word (`…he promised`). Web `snippetAround` snaps to a word. | Y | Y. Live `checkout` on WEB-1 is `…checkout summary step before the customer pays.` It does not start at "he promised". |
| QA-08 | WEB-142 jump | P0 | Not broken on mocks. Top bar `WEB-142` opened the drawer. | n/a | Y. Search tip uses WEB-1. Placeholder says "a task key". |
| QA-09 | Command palette (`CommandPalette.dc.html`) | - | Ctrl/Cmd K overlay, Esc, actions. `apple` → WEB-139 + New task named "apple" (mock pass). | Y | Live `checkout` → WEB-1. Tab filters by project. Footer nowrap at 1440. |
| QA-10 | Projects (`Projects.dc.html`) | P1 | New project used brand green; spec is ink (`#121417`). | Y | No category stacked bars. Live card shows lead name (`BornTask Owner`) and `1 open`. Cards stack on narrow width. |
| QA-11 | Admin People (`AdminPeople.dc.html`) | P1 | Subtitle said `1 people`. | Y | Y for domain chips. `allowedDomains` is null, so People shows "No sign-in domain is saved yet." and Add domain, not a chip taken from the email. Billing, Profile and API tokens are in the settings nav (seen 16 Oct). |
| QA-12 | Workflow (`WorkflowEditor.dc.html`) | - | Delivery stages and moves load for the owner. Add stage and Remove both save. | n/a | Added `QA probe`, saved, reloaded, removed it, saved. Delivery is back to Idea, Approved, WIP, Ready for testing, Testing, Deployed, On hold, Rejected (12 moves). No role editor on a move beyond the comment checkbox. |
| QA-13 | Create workspace (`CreateWorkspace.dc.html`) | - | Stepper + copy match. | n/a | No 14-day trial note (billing, out of scope). |
| QA-14 | Welcome member (`WelcomeMember.dc.html`) | - | Empty My tasks copy + project cards. | n/a | Standalone route, not the in-app shell empty state. |
| QA-15 | Welcome guest / Accept invite / Wrong account | P2 | Owner opening a guest invite URL goes to wrong-account. Matching email accepts and lands on welcome guest. | Y | Chip "Different account". Both emails shown. Ask button names the signed-in address. Welcome guest copy leftover vs Business/ideas list is unchanged. |
| QA-16 | Import / Create project / Defaults / Workspace general | P2 | Screens load on the live API. Copy and fields are a cut-down of the `.dc.html` files. | Y | Unknown-email filter is Y. Create project is the mock dialog. Defaults chips/counts/Default badge are Y. Workspace logo + ConfirmDialog delete are Y. XLSX stays N. |
| QA-17 | Sidebar vs Search.dc.html | P2 | Search + Favourites + Settings present. On this pane the nav wraps into a horizontal strip. | N | Spec is a 272px left column at 1440. Banner remains while `VITE_USE_MOCKS=true`. |
| QA-18 | Live vs mock after login | P2 | With both mock flags false, the owner sees seed project **Website (WEB)**, not Scope sample projects (no MOB, no CLI). | Y | Y. With `VITE_USE_MOCKS=false` and both mock flags false, the shell does not show "Live API with mock fallback" or the tag "API + fallback". The banner only appears when a mock flag is on. |

## Evening comparison vs `.dc.html`

Import (`Import.dc.html`): project picker listed Website (WEB). A one-row CSV mapped Task ID, Name, Notes, Assignee Email, and Section, and previewed that row. XLSX is rejected: "Save the Asana export as CSV for now. XLSX parsing is not bundled yet." Missing vs spec: four-step stepper, file chip, "sections become statuses" toggle, status map, people card. The unknown-email warning used to list `guest@qa.borntask.test` even though that guest is already in the workspace, and the copy said "1 emails". Fixed: a CSV with `owner@borntask.com` and `stranger@example.com` returns only `stranger@example.com`. A CSV with only `guest@qa.borntask.test` returns `unknownEmails: []`. The screen says "1 email is" / "emails are". Those probe jobs were deleted. Import was not started.

Create project (`CreateProject.dc.html`): page at `/projects/new`, not a dialog over the project grid. Fields are name, key, Delivery/Simple, a sections textarea, and a members multi-select. Missing: colour swatches, section chips, per-person project roles, invite-by-email, Cancel. Form was not submitted.

Defaults (`AdminDefaults.dc.html`): Project lead, Business, Developer, Tester, Observer. Types Idea, Bug, Improvement, Feature with template text. Delivery 8 statuses / 12 transitions, Simple 3 / 4. Missing: coloured role chips, people counts, add role, add type, edit template, workflow cards, Default badge, New workflow.

Workspace general (`WorkspaceGeneral.dc.html`): name **BornTask**, address `internal.borntask.com`, time zone, week start, default workflow, bugs start in, Google, Microsoft, members can invite guests, Save. Missing: logo upload, the Microsoft and guest helper lines, Delete workspace. Sign-in domains are on the People spec, not this screen.

## What I clicked

Morning:

1. `/sign-in` - saw the fold bug, signed in after API start.
2. Top bar `checkout` + Enter - 7 mock results.
3. WEB-142 result and top-bar key jump - drawer.
4. `/projects`, `/settings/people`, `/settings/workflow`, `/create-workspace`, `/welcome/member`.
5. Command palette (`apple`).

Evening (mock flags off, Vite restarted):

1. `/sign-in` as `owner@borntask.com` - My tasks empty (seed task is unassigned). Projects: Website only.
2. `/p/WEB/list` - WEB-1 "Seed task for internal workspace". Set its description (via `PATCH /tasks/WEB-1`; drawer blur did not persist in this pass) and searched `checkout`.
3. Project **+** invited `guest@qa.borntask.test` as Guest. Console URL opened as the owner: wrong-account, then "Ask for an invite" succeeded.
4. Developer sign-in as QA Guest on that invite URL, Accept, landed on `/?welcome=guest` ("Welcome, QA. You're in." Website only, guest banner).
5. Back as owner: `/import` (CSV map + preview, XLSX reject), `/projects/new`, `/settings/defaults`, `/settings/workspace`, `/settings/people` (2 people, no pending invite).
6. `/settings/workflow` - add `QA probe`, save, reload, remove, save. Delivery restored.

## Data left by this tour

- `guest@qa.borntask.test` (QA Guest) is a guest on BornTask / Website.
- WEB-1 description is the checkout sentence used for the snippet check.
- An invite-request row exists from the owner asking on the guest invite.
- Delivery workflow matches the seed stages again.

## Still later

Sheets, Chat DMs, Stripe, Plesk, XLSX parsing. SSE already ships. Create-project dialog, delete workspace, defaults chips and wrong-account copy were closed later on 16 Oct. Snippet word boundary, unknown-email filter and sign-in domain chips were closed earlier the same day.

# QA log - 16 Oct 2026

App: http://localhost:5174 with `VITE_USE_MOCKS=false` (live API on 3010). Signed in as `owner@borntask.com` (BornTask Owner). Project key WEB (Website). Brand sample on Members: body DM Sans, h1 Sora, New task `rgb(23, 138, 92)` (`#178A5C`). No saffron in the page HTML. Toasts seen were StatusToast or inline Alert. Confirmations were ConfirmDialog (Stay / Leave, Revoke, Disconnect, Remove).

Gates after the fixes below: `npm run typecheck` passed, `npm run design:lint` 0 errors.

| Route | Result | What was checked |
|---|---|---|
| `/settings/workspace` | pass | Name, timezone, week start, bugs start in, members can invite guests. Dirty leave warned Stay / Leave. Save persisted across reload, then restored (BornTask, Europe/Malta, Monday, Approved, guests on). After Save, leave was silent. Toast: Workspace saved. |
| `/settings/people` | pass | Invite outside the domain saved as guest. Resend toast. Revoke used ConfirmDialog and removed the invite. Guest workspace role changed to Viewer, reloaded, restored to Guest. Domain remove dialog cancelled. |
| `/settings/defaults` | fail, then pass | Roles, types and workflows load. Added role QA probe, reload persisted, Delete confirm removed it. **P0:** a typed role draft navigated to People with no Stay / Leave. Wired `useUnsavedChanges` while a role or type draft is open. Retest: draft "QA probe" blocked leave; Stay kept the draft; Cancel then leave was silent. |
| `/settings/workflow` | pass | Unsaved banner. Leave blocked until Stay. Added stage QA probe, Save workflow, reload, Remove confirm, Save. Delivery restored to 8 stages. "Workflow saved." was an inline Alert; later the same day it is a StatusToast. After Save, leave was silent. |
| `/settings/billing` | pass | Visible. Copy says card collection is not connected. No Stripe. |
| `/settings/profile` | pass | Chat column on because the Chat app env is set. Name, timezone, digest and the notify grid saved and reloaded, then restored. Invalid personal webhook blocked leave and Save. A fake webhook saved masked, test returned Google rejected the URL (not an Ant snackbar), Disconnect confirm cleared it. |
| `/settings/tokens` | pass | MCP URL `http://localhost:3011/mcp`. Created QA retest, copy-now banner, reload showed only the mask. Revoke confirm says "This can't be undone." Token removed. |
| `/p/WEB/settings/details` | pass | Name and colour saved and reloaded, then restored to Website / `#178A5C`. Dirty leave warned. After Save, leave was silent. Workflow left on Delivery. |
| `/p/WEB/settings/members` | pass | Remove confirm cancelled. Role add persisted and was cleared. **P1:** + role menu showed slugs. Labels now use the catalog name. Retest menu: Business, Developer, Observer. |
| `/p/WEB/settings/structure` | fail, then pass | Added section QA shelf, reload persisted, delete moved tasks to Inbox and removed it. Trash empty. **P0:** clicking a type switch raised StatusToast "Types for this project stay on." Switches are now checked and disabled. Retest: click kept the switch on and showed no toast. |
| `/p/WEB/settings/workflow` | pass | Automations card present (Ready for testing assigns Tester, Deployed notifies Business). Toggled the tester rule off, API 200, toggled it back on. Dirty stage name blocked leave (Stay / Leave). Clearing the edit left for GitHub with no dialog. |
| `/p/WEB/settings/chat` | pass | Already connected to a real space webhook (left in place). Event "Any status change" saved, reloaded, restored off. Invalid URL blocked Save with no request. Disconnect confirm opened and cancelled. Dirty URL blocked leave. Footnote: webhooks only post into the space; creating tasks from Chat needs the Chat app. |
| `/p/WEB/settings/github` | pass, then fixed | No crash. Seed installation showed connected (`your-github-org`, repo `your-github-org/website`) even though `GITHUB_APP_*` is unset (`appConfigured` false). Later the same day, `appConfigured` false returns connected false, no account, no repos and no events. The page says "GitHub App is not installed yet". Draft pull request rule had been saved on, reloaded, restored off. |
| Guest and member nav | pass | Guest sidebar has no Settings link. Direct settings URLs omit General, Roles/types/workflows, Workflow editor and Billing. Member (QA user temporarily) saw People, Profile and API tokens only. Workspace Save stayed disabled. Role restored to guest. Owner session restored. |

## Skip

- Chat "Send test message" on `/p/WEB/settings/chat` was not sent. The stored webhook is a real Google Chat URL, and a test would post into that space. Profile already proved the test path against a fake URL ("Google rejected the URL").
- Project details workflow was not switched off Delivery (that moves tasks).
- Stripe, Chat API DMs, and deploy were not started.

## Fixes

- `AdminDefaultsScreen.tsx`: leave warning while a role or type draft is open.
- `ProjectStructureScreen.tsx`: type switches stay on and disabled, with no info toast.
- `ProjectMembersScreen.tsx`: + role menu shows the role name.

## Data left

Workspace, profile, WEB name and colour, Delivery stages, guest role, GitHub draft-PR rule, Chat events, and the tester automation match the state from before this pass. The project Chat webhook was not disconnected. Pending invites that were already there (`audit.invite@example.com`, `anna@borntask.com`) were not revoked. QA probe role, QA probe stage, QA shelf section, and the QA retest token are gone.

## Leftovers closed later on 16 Oct

Gates: `npm run typecheck` passed. `npm run design:lint` 0 errors (50 existing warnings).

| Item | Result | Evidence |
|---|---|---|
| QA-07 search snippet | Y | `GET /search?q=checkout` and the search page (Include Deployed and Rejected on, because WEB-1 is Deployed) show `…checkout summary step before the customer pays.` |
| QA-05 / QA-08 search copy | Y | Placeholder "Search tasks or jump to a task key". Tip names WEB-1. |
| QA-18 mock banner | Y | Shell text has neither "Live API with mock fallback" nor "API + fallback". |
| QA-11 domain chips | Y | `GET /workspace` `allowedDomains` is null. People shows "No sign-in domain is saved yet." Add domain stays. No chip for `borntask.com`. |
| Import unknown emails | Y | Member addresses are omitted. One new address is a single `unknownEmails` entry. Copy is "1 email is" / "emails are". |
| GitHub empty vs seed | Y | `GET /projects/WEB/github` is `appConfigured: false`, `connected: false`, `accountLogin: null`, `repos: []`, `events: 0`. UI: "GitHub App is not installed yet". |
| Workflow saved chrome | Y | Save on unchanged Delivery returned 200. Status toast "Workflow saved." No inline success Alert. |

Skipped, still N: XLSX parsing, 14-day trial, Stripe, Chat DMs, deploy. SSE is already shipped (`GET /stream` + `useLiveUpdates`); the earlier N was stale. Stacked category bars closed in the later 16 Oct pass.

## P2 leftovers vs mocks - 16 Oct evening

App: http://localhost:5174 at 1440x900, live API, signed in as `owner@borntask.com`. Gates: `npm run typecheck` passed. `npm run design:lint` 0 errors (50 existing warnings). Did not deploy. Did not start Stripe, XLSX, Chat DMs or extra SSE work.

| Item | Result | Evidence |
|---|---|---|
| Create project (`CreateProject.dc.html`) | Y | `/projects/new` is a dialog over the project grid (matches the mock). Colour swatches, section chips (+ Section), Cancel back to `/projects`, members with catalog role names, invite-by-email + Invite. Kept the page route. |
| Defaults (`AdminDefaults.dc.html`) | Y | Coloured `RoleTag`/`TypeTag`. People counts from role grants (Project lead 1 person, Tester 1 person, others 0). Default badge on Delivery. + Add role / + Add type / New workflow already present. Cards link to the existing workflow editor. |
| Workspace general (`WorkspaceGeneral.dc.html`) | Y | Upload logo posts to `/workspace/logo` (BLOB_ROOT). Microsoft and guest helper lines. Owner-only Delete workspace opens ConfirmDialog; confirm stays disabled until the workspace name is typed. `POST /workspace/delete` soft-deletes. Dialog cancelled. |
| Wrong account (`WrongAccount.dc.html`) | Y | Invite `ops@qa.borntask.test` as the owner landed on `/invite/.../wrong-account`. Chip "Different account". Invited `ops@qa.borntask.test`, signed in as `owner@borntask.com`. Button "Ask for an invitation to owner@borntask.com". Ask flow left in place (not clicked this pass). |
| Command palette (`CommandPalette.dc.html`) | Y | Live `checkout` hit WEB-1 (Deployed). Tab filtered to Website ("Tasks in Website"). Footer nowrap at 1440: move, open, Tab to filter by project. Height 40px, width 620. |
| QA-01 sign-in 1440 | Y | Existing flex (`1 1 420px`) already sits hero beside form at 1440. No new media query. Phone-width stack left as-is. |
| SSE | Y (already shipped) | `apps/api/src/routes/stream.ts` + `apps/web/src/hooks/useLiveUpdates.ts`. Not rebuilt. |

Still N: XLSX, Stripe, Chat DMs, 14-day trial, deploy. Create-project-as-dialog is Y (it is the mock dialog). Delete workspace is Y.

## P2 leftovers - 16 Oct later

App: http://localhost:5174 at 1440x900, live API, signed in as `owner@borntask.com`. Gates: `npm run typecheck` passed. `npm run design:lint` 0 errors (50 existing warnings). Did not deploy. Did not start Stripe, XLSX, Chat DMs or a real import.

| Item | Result | Evidence |
|---|---|---|
| Import closer to spec (`Import.dc.html`) | Y | `/import` four-step stepper (Upload / Map columns / Preview / Import). Choose CSV into Website (WEB). File chip `qa-p2-import.csv` (2 rows · 5 columns). People card: `1 assignee matches` + `1 email is new` (`stranger@example.com`). Section column present so "Asana sections become" + status map (QA / In progress to Idea, counts from the existing mapping). Preview 20 rows opened Start import; not clicked. XLSX stays N: "Save the Asana export as CSV for now. XLSX parsing is not bundled yet." |
| QA-12 workflow roles | Y | `/settings/workflow` Delivery. Each move has a multi-select of catalog roles plus Comment. Empty list shows Any member. Idea → On hold set to Business (and Tester from the same edit), Save workflow toast, reload showed Tester + Business. Cleared back to Any member and saved again. Owner only (admin same path). |
| QA-10 project category bars | Y | `GET /projects` already returns `counts` (backlog / active / review / done). `/projects` at 1440: Website card 8 open · 0 in review · 1 deployed, stacked bar + Backlog/Active/Review/Done legend. Numbers from the API, not faked. |
| SSE | Y (already shipped) | Not listed as open. |

Still N: XLSX, Stripe, Chat DMs, 14-day trial, deploy.

# QA smoke - 22 Oct 2026

Token-light pass. Gates: `npm test` 45 passed after isolation re-run; `npm run design:lint` 0 errors / 0 warnings. Did not run typecheck. API 3010 and web 5174 were already up. Signed in as `owner@borntask.com`. Reusable playbook: `.cursor/commands/qa-smoke.md`.

| ID | Flow | Result | Finding |
|---|---|---|---|
| QA-22-01 | Isolation tests | Y | First `npm test` failed: `Project.disabledTypes` missing. Re-run of `tests/isolation` then passed (column present). |
| QA-22-02 | Prisma migrate history | Y | `prisma migrate deploy` returns P3005 (schema not empty / not baselined). Bigger than a smoke fix. Apply new SQL by hand or baseline `_prisma_migrations`. |
| QA-22-03 | API reads | Y | Dev-login + GET `/me`, `/projects`, `/projects/WEB`, `/projects/WEB/tasks`, `/me/tasks`, `/tasks/WEB-1`, `/search?q=checkout`, `/people`, `/workflows`, `/me/notifications`, `/me/profile`, `/me/tokens`, `/projects/WEB/github`, `/projects/WEB/chat`, `/projects/WEB/automations` all 200. |
| QA-22-04 | `GET /tasks?project=WEB` | n/a | 404. Correct path is `/projects/WEB/tasks`. Not a product bug. |
| QA-22-05 | My tasks / List / Board / People | Y | `/` shows empty assigned + Website card. `/p/WEB/list` and `/p/WEB/board` list live tasks. `/settings/people` loads. Inbox shows 1 unread. |
| QA-22-06 | Status category filter | leftover | List and board show "Remove Status category filter". Deployed WEB-1 is hidden. Stored view, not a crash. |

Still N (unchanged): XLSX, Stripe, Chat DMs, 14-day trial, deploy. Prisma baseline was closed on 29 Oct.

# Pre-deploy review - 29 Oct 2026

Scope: commit `f14c66a` ("many small changes") - work breakdown (stories/epics), list grouping, import parent column, profile prefs, filters. Did not deploy. Did not start a new import or create extra tasks.

Gates (fresh this pass):

| Gate | Result |
|---|---|
| `npm test` | 12 files, 63 tests passed (includes isolation + leftovers planning rules) |
| `npm run typecheck` | passed (shared, api, mcp, web, worker) |
| `npm run design:check` | contrast AA pass; design lint 98 files, 0 errors, 0 warnings |
| API 3010 | 200 after dev-login: `/me`, `/projects`, `/projects/WEB` (`workBreakdown: epics_stories`, `storiesNeedApproval: true`), `/projects/WEB/tasks` (planning parent fields present), `/me/tasks`, `/me/profile`, `/people`, `/workflows` |
| UI 5174 | `/p/WEB/settings/details` shows Work breakdown radios + "Stories and epics start in Idea" switch. `/p/WEB/list` loads. Group by Story/Epic not visible in the narrow browser pane (`!isPhone`). Status category filter chip still present (QA-22-06). |

| ID | Pri | Area | Finding | Fix vs log |
|---|---|---|---|---|
| QA-29-01 | P0 | Deploy | New migration `prisma/migrations/20261029150000_work_breakdown/migration.sql` adds `Project.workBreakdown`, `Project.storiesNeedApproval`, `Task.planningParentId`. Prod will break if this is not applied. Existing leftover: `prisma migrate deploy` P3005 (not baselined). | Y locally. `prisma/migrateDeploy.mjs` baselines present migrations then deploys the rest. Plesk `deploy.sh` now runs that instead of `db push`. Not deployed. |
| QA-29-02 | P2 | Quick add vs API | Web `initialStatusFor()` always starts bugs in Approved (`type === 'bug'`). API uses `createTaskStartSlug()` + `Workspace.bugsStartIn`. Workspace set to Idea would mismatch between drawer/API and Quick add. | Y. `initialStatusFor` uses `createTaskStartSlug`. Catalog now carries `bugsStartIn` into Quick add. |
| QA-29-03 | P2 | Brand / create project | Create project uses a native checkbox for "Stories and epics start in Idea and need approval". Project details uses Ant Design Switch and shorter copy "Stories and epics start in Idea". Same setting, two controls and two labels. | Y. Both screens use Switch + "Stories and epics start in Idea". |
| QA-29-04 | P2 | Board | `ProjectBoardScreen` hides story and epic cards (`task.type !== 'story' && task.type !== 'epic'`). Board has no Story/Epic grouping. Planning items only appear on list. | Y. They are tasks on the same workflow, so the board no longer hides them. |
| QA-29-05 | P2 | List group | `groupTasks` builds the parent map from the *filtered* task list. If a story/epic is hidden by the Open/Completed filter, children land in "No story" / "No epic". | Y. Parents come from the full project set; rows inside groups stay filtered. |
| QA-29-06 | P2 | Breakdown off | Turning work breakdown off does not clear `planningParentId` or change existing story/epic types. Saved views can still group by story. | Y. Keep data. Hide types and grouping. Invalid story/epic group falls back to section. |
| QA-29-07 | P2 | Type chips | `PLANNING_TYPES` colours `#0F4C6A` / `#6B3D7A` are not on `chipSwatches`. Catalog `TypeTag` uses `chipFromHex`, so Story/Epic chips can miss the dark tokens in `theme.css`. | Y. Swatches added. `TypeTag` prefers `typeStyle` for builtin slugs. |
| QA-29-08 | P2 | Import | Asana parent column still writes `Task.parentId` (subtask). Label is "Parent task (subtask)". It does not set `planningParentId`. Jira-style story/epic trees will not import as work breakdown. | Skipped. Import stays subtask `parentId`. |
| QA-29-09 | P3 | Tests | Leftovers cover `planningTypeAllowed` / `planningParentAllowed` / start slugs only. No API test for create/update parent, loop, or type-not-allowed. | Y. `tests/planningParent.test.ts` covers create, update, self-parent, loop, type not allowed. |
| QA-29-10 | P3 | MCP copy | `create_task` now accepts story/epic and `planningParentId`, but the tool description still only mentions idea/bug start rules. | Y. Description names story/epic start rules and work breakdown. |
| QA-29-11 | P3 | Leftover | List still shows "Remove Status category filter" (QA-22-06). Not new, still hides Deployed WEB-1. | Y. Default view is All (no filters). Open remains a preset. |

Brand pass: no em dash in new UI copy (hyphens in "Off - a flat list"). Brand green `#178A5C` on Website. New type tokens exist in light, dark, and system dark. Create-project checkbox is the main UI inconsistency.

Still N: XLSX, Stripe, Chat DMs, 14-day trial, deploy. Prisma migrate path is in repo; prod still needs a deploy to run it.

## Timesheets / Reports pending

- 31 Oct 2026, chat 1 (API only): Reports fixture totals (48 opened, 41 closed, 63 open, 7 overdue, 659:30) are covered by `CANVAS_REPORTS_FIXTURE` in unit tests. The live seed workspace does not contain that canvas sample, so `/reports/workspace` will not return those tiles until a later chat seeds or imports them. Completeness formula matches `TIMESHEETS-REPORTS.md`.
  - **wont-fix (chat 5):** Live seed is not the canvas sample. Unit tests keep the fixture numbers. Do not invent a second seed dataset in this pass.
- 31 Oct 2026, chat 4 (Reports screen): Live `GET /reports/workspace` does not return task-by-person, upcoming dues, unscheduled count, deployed/rejected split, on-hold split, or medians. The mock fixture shows those from Reports.dc.html. Missing-list detail on live is a count summary, not dated ranges. Custom period label is "Custom" (ASCII) rather than the mock ellipsis.
  - **done (chat 5):** API now returns unscheduled, deployed/rejected and on-hold hints, medians plus averages, by-person, upcoming dues, per-project median close/start, and missing-list date spans. Period chip is `Custom...` (three ASCII dots; no ellipsis character).
- 31 Oct 2026, chat 2 (Workspace general): `WorkspaceGeneral.dc.html` Timesheets list shows 14 Malta holidays and a always-visible Show all. Seed workspace starts empty; Show all only appears when some dates are already past. Did not seed canvas holidays.
  - **done (chat 5):** Show all is visible whenever the year has any holidays. **wont-fix:** 14 Malta holidays stay owner-entered; not seeded.
- 31 Oct 2026, chat 2 (Workspace general): Mock order is identity, Timesheets, Security, Delete. Shipped still has the existing Google Chat card after Timesheets. Period/unit use Ant Design radios (token-styled cards), not the canvas native inputs.
  - **done (chat 5):** Section order is identity, Timesheets, Security, Delete, then the existing Google Chat card (not in the mock). **wont-fix:** period/unit stay Ant Design radios; native canvas inputs are out of kit.
- 31 Oct 2026, chat 3 (Timesheets): Live workspace is weekly + hours, so `/timesheets` ships the weekly grid and days-off count. The daily week grid, day-header Leave/Other menu, locked Off cells, weekend copy, holiday column, and cell-note popover were not clicked on this workspace. They render when `timesheetPeriod` is daily.
  - **done (chat 5):** Daily grid, Leave/Other header menu, Off lock, weekend copy, holiday column and notes are in `TimesheetsScreen`. Switching period in General settings is enough to use them. No extra daily-only route.
- 31 Oct 2026, chat 3 (Timesheets): Guest/viewer empty state and "no projects" empty state were not signed in as those roles. Sidebar hides Timesheets for guest and viewer. Who-sees-what table from SheetTimesheets is not a live page (spec only).
  - **done (chat 5):** Guest/viewer copy and no-projects empty state are in the screen; sidebar omits Timesheets for guest and viewer. **wont-fix:** who-sees-what stays a spec table, not a live page.
- 31 Oct 2026, chat 3 (Timesheets): Seed projects are Website / Test / Another test, not the canvas WEB/MOB/CLI/OPS sample. Last-week tile and days-logged numbers therefore do not match the 38:00 / 4 of 4 fixture.
  - **wont-fix (chat 5):** Live tiles use live time. Canvas 38:00 / 4 of 4 is the mock fixture only.

# Timesheets / Reports round 2 dark and mobile - 31 Oct 2026

App: http://localhost:5174, live API (`VITE_USE_MOCKS` not used for this walk). Signed in as owner. Compared to `apps/web/docs/DARK-MODE.md` tokens and Timesheets / Reports / WorkspaceGeneral mocks. Did not implement features. Did not change Chat 6. Did not reopen Chat 5 wont-fix. Did not mark the feature done.

Walked `/settings/workspace` (Timesheets card), `/timesheets`, and `/settings/reports` at 1440 dark (Appearance already Dark / `data-theme=dark`), 390 light, and 390 dark. Device theme for the 390 light pass was `localStorage bt-theme=light`; restored Dark after that pass.

| ID | Route | Viewport | Severity | Finding | Mock vs shipped | Brand or mock |
|---|---|---|---|---|---|---|
| QA-TR2-01 | `/settings/workspace` | 1440 dark | - | Timesheets card uses canvas `#0E100F`, surface, muted `#8F968B` on "Owners and admins only." and helper copy. Radio cards and working-day chips use ink / brandTint / brandText, not light page hex. Disabled Save is faint white on chip fill (Ant Design disabled). | Shipped Ant Design radio cards (Chat 5 wont-fix). Holidays are owner-entered (QA holiday, Christmas Day), not the 14 Malta mock list. | Brand tokens match DARK-MODE.md. |
| QA-TR2-02 | `/timesheets` | 1440 dark | - | Page canvas `#0E100F`. Cells `rgb(22, 25, 23)` / border `#2C312D`. Holiday Fri cell `rgb(24, 40, 70)`. Sat uses brand-tint border. Subtitle muted `#8F968B`. No inline leftover `#F7F8F6` / `#FFFFFF` fills on the grid. Day menu items (Leave / Other) use ink `#E8EBE5`. Live week 2:30 on Website Thu, not mock 38:00. | Shipped daily grid vs SheetTimesheets canvas sample projects. | Brand. |
| QA-TR2-03 | `/settings/reports` | 1440 dark | - | Tiles, period chips, and rollup tables readable on dark surface. Muted intro `#8F968B`. Live This month: 18 opened, 1 closed, 17 open, 2:30 logged, 20 missing days. `Custom...` ASCII. | Shipped live totals, not Reports.dc.html 48 / 41 / 63 / 659:30 (Chat 5 wont-fix). | Brand. |
| QA-TR2-04 | `/timesheets` | 1440 dark | P3 | `+ New task` computed fill is `rgb(21, 115, 80)`, not exact `brandFill` `#15845A` (`rgb(21, 132, 90)`). White label. Same on 390 dark. Ant Design dark primary, not a light leftover hex. | Shipped shell button, not a timesheet-mock control. | Brand. |
| QA-TR2-05 | `/settings/workspace` | 390 light | P3 | Settings inner nav fills the first screen; Workspace / Timesheets sit below in `main`. No page-width overflow (`scrollWidth` 390). Working-day chips and period cards fit the column. | Mock is 1440 two-pane. Shipped phone settings stack (same as other settings). | Mock leftover (layout). |
| QA-TR2-06 | `/timesheets` | 390 light | - | Shell uses the compact top bar (Timesheets title, search). Week tools wrap (Copy last week, range, This week). Grid lives in a `section` with `overflow-x: auto` (about 860 vs 357). Page does not grow past 390. | Mock week grid is desktop-wide; shipped scrolls. | Mock leftover (horizontal scroll, expected). |
| QA-TR2-07 | `/timesheets` | 390 light | - | Mon day menu opened: Leave and Other, 226x36, fully in the 390x844 view, ink on raised. Not clipped by the grid scroller. | Shipped. | Brand. |
| QA-TR2-08 | `/settings/reports` | 390 light | P3 | Period chips wrap ("This" / "week"). Selected This month is ink `#121417` fill and white text, not `brandFill`. By project table is 760px inside a section with `overflow-x: auto` (357 client). Chips stay readable. | Mock period row stays one line at 1440. Shipped wraps and scrolls tables. | Brand (selected chip is ink, not green) and mock leftover (wrap / scroll). |
| QA-TR2-09 | `/settings/workspace` | 390 dark | - | Settings nav on `#0E100F`. Selected General uses brandTint / brand text. Timesheets radios: unselected surface `#161917` + ink; selected week card `rgb(18, 42, 30)` (brandTint). Mon chip brandText `#4CC48F` on tint; Sat unchecked ink3. Helper copy muted. No unreadable chips. | Same Ant Design radios as Chat 5 wont-fix. | Brand. |
| QA-TR2-10 | `/timesheets` | 390 dark | - | Canvas and tiles dark. Muted subtitle `#8F968B`. Grid still section-scrolls. Day menu item in view (ink `#E8EBE5`, 226x36). No clipped menu, no faint-on-faint chips. | Shipped. | Brand. |
| QA-TR2-11 | `/settings/reports` | 390 dark | P3 | Selected This month chip is `#E8EBE5` on `#161917` text (inverted, readable). Unselected chips ink3 `#D3D7CF` on transparent. Tables still 760 in `overflow-x: auto` section. Not unreadable; same wrap as light 390. | Shipped. | Brand (chip is ink invert, not brandFill). |

Tour notes (not product gaps): this walk briefly saved workspace period as weekly while probing radios, then set A day again; confirm General if the daily grid is missing. Mon 26 Oct day menu later showed "Back to a working day", so a Leave/Other mark may remain on that date. Reports tiles stay live seed numbers (Chat 5 wont-fix).

Chat 7: no P0/P1 in this section. QA-TR2-04 **done** - primary Button uses `brandFill`. QA-TR2-08/11 **done** - selected period chip is brandFill, chips stay on one line and scroll. QA-TR2-05 **done** - same settings stack as the rest of Settings; Timesheets and Reports are in the You sheet on a phone.

# Timesheets / Reports round 2 - 31 Oct 2026

App: http://localhost:5174 at 1440x900, live API. Signed in as `owner@borntask.com`. Clicked `/settings/workspace` Timesheets, `/timesheets` (daily then weekly), `/settings/reports`. `GET /people` is owner + `guest@qa.borntask.test` only - no member or project-lead account to sign in as. Did not reopen chat 5 wont-fix bullets. `npm run design:lint`: 101 files, 0 errors, 0 warnings. No em dash, no emoji, no saffron in the clicked copy. Hyphens in `26 Oct - 1 Nov 2026`, `Custom...`, `Logged / expected`.

Data left: workspace period back to **A week** / Time; Christmas Day 2026; **QA holiday** 30 Oct 2026 (also copied toward 2027); owner days off Mon 26 Leave and Wed 28 Other; Website Thu 29 **2:30** (daily entry).

| ID | Route | Severity | Mock vs shipped | Brand or mock |
|---|---|---|---|---|
| TR2-01 | `/settings/workspace` | P1 | Add holiday while workspace Save is dirty: modal submit disables holiday buttons and closes with no row on the upcoming list. The date was saved (`QA holiday` 30 Oct). Re-add shows "That date already has a holiday." Dirty period (A day) was discarded when the modal closed. | mock |
| | | **done (chat 7)** | Holiday save no longer resets a dirty General form. A past date added this session opens Show all so the row stays visible. | |
| TR2-02 | `/settings/workspace` | P2 | Upcoming list hides a just-added past date until Show all. Chat 5 already made Show all visible when any holidays exist. | mock |
| | | **done (chat 7)** | Adding a past date switches to Show all. Upcoming still hides older dates on a later visit. | |
| TR2-03 | `/settings/workspace` | - | Period A day / A week, unit Time / Percentage, Mon-Fri chips (Sat toggle on then off), + Add holiday, Copy to 2027 toast, Show all / Remove controls all click. Copy: organisation-style British English, hyphens. | brand |
| TR2-04 | `/timesheets` (daily) | - | Tiles This week / Today / Last week / Days logged of expected / Days off. After 2:30 on Website Thu plus two days off and Fri holiday: `2:30`, `1 of 2 expected`, `2 Mon, Wed`. Headers `Off: Leave` / `Off: Other` / `Public holiday`. Cells lock to Off. Day totals Leave / Other. | mock |
| TR2-05 | `/timesheets` | - | Day with time: menu "This day has time logged. Clear it first to mark the day off." `PUT /api/timesheets/days-off` on 2026-10-29 returns **409** `Clear the time logged on this day before you mark it as a day off.` Weekend Sat: "Not a working day in this workspace. Log time here only if you worked." Weekend PUT 409 `That date is not a working day.` | mock |
| TR2-06 | `/timesheets` | P2 | Time-already-logged menu omits the hours. Mock: "This day has 7:30 logged." | mock |
| | | **done (chat 7)** | Menu now includes the logged total, e.g. "This day has 2:30 logged." | |
| TR2-07 | `/timesheets` | P2 | Holiday column uses editable inputs with placeholder `Holiday`, not a locked Holiday label until someone types. Extra time on a holiday still possible. | mock |
| | | **done (chat 7)** | Empty holiday cells show a Holiday label. Click to type extra time. | |
| TR2-08 | `/timesheets` | - | Clicking a filled cell opens Note / Clear this cell / Cancel / Save note. | mock |
| TR2-09 | `/timesheets` | P2 | Viewing lists **QA Guest**. Guests do not fill timesheets. Could not prove lead "Off" without type: no project-lead user in this workspace. | mock |
| | | **done (chat 7)** | Viewing omits guest and viewer. Lead Off-without-type stays the API contract (F-12). | |
| TR2-10 | `/timesheets` (weekly) | P1 | After switch back to A week: My days off count `2`, Type Leave, helper "5 working days, minus 2 days off = 3 days" and max "(5 here)". Fri 30 Oct is still QA holiday. Mock subtracts holidays from the weekly cap. | mock |
| | | **done (chat 7)** | Helper and max use working days minus holidays. Server already skips holidays when placing weekly days off. | |
| TR2-11 | `/timesheets` | - | Copy last week, prev/next, This week are on the page. Week label uses a hyphen. Daily 2:30 does not appear on the weekly grid (saved period kept). Footer still mentions "next day" while in weekly mode. | mock |
| TR2-12 | `/settings/reports` | - | Period chips This week / This month (default) / Last month / Custom... Project All projects + Website / Test / Another test. Task tiles, timesheet tiles, Off column, Logged / expected, missing list with leave dates. This month after two leave days: Days off 2, Missing 18, `1 / 19`, missing line names Mon 26 and Wed 28. This week range `26 October - 1 November 2026 · 4 working days so far, including QA holiday`. | mock |
| TR2-13 | `/settings/reports` | P2 | Month range "21 working days so far, including QA holiday" vs table `1 / 19` vs Missing 18. Spec expected = working days - holidays - days off. Copy does not make the subtraction obvious. Live tiles are not the canvas 659:30 / 4 complete (chat 5 wont-fix). | mock |
| | | **done (chat 7)** | Range line now says expected working days after subtracting holidays; days off still come off each person. Canvas 659:30 stays chat 5 wont-fix. | |
| TR2-14 | brand | - | design:lint clean. No emoji. Hyphens only in UI copy checked. British English (colour stays on workspace, authorised not used here). Primary remains brand green. | brand |

# Timesheets / Reports round 2 functional - 31 Oct 2026

Chat 6c. Functional only. Did not implement features. Did not edit Chat 6. Did not reopen Chat 5 wont-fix. Did not mark done.

App: http://localhost:5174, live API 3010, `VITE_USE_MOCKS=false`. Owner `owner@borntask.com`. Also signed in as `qa.ts.member@borntask.com` (member), `qa.ts.lead@borntask.com` (member + lead of new QTL), `qa.ts.guest@qa.borntask.test` (guest). Workspace default period is weekly / time / Mon-Fri. Daily Leave/Other/weekend/holiday checks used `PATCH /workspace` then restore.

Data left: people QA TS Member / Lead / Guest; project **QA TS Lead project** (QTL); holidays Christmas Day 2026, **QA Republic Day UI** 13 Nov 2026 (and a 2027 copy from earlier walks); owner days off Mon 26 - Tue 27 Leave (`weekly count`); mixed daily + weekly time on Website / QTL this week.

| ID | Flow | Result | Notes | Severity if fail |
|---|---|---|---|---|
| F-01 | Save hours on a project; reload; value still there | pass | `PUT /timesheets` 200 `{saved:1}` Fri 30 Oct Website 2:30. GET returned minutes 150 then 180 after edit. UI weekly cell Website `2:30` survived reload; note `UI weekly note` stayed in the input. | |
| F-02 | Edit a cell; note on a filled cell; note survives reload | pass | API note `QA note edited` after second PUT. UI note field persisted after navigate away and back to `/timesheets`. | |
| F-03 | Copy last week | pass | Seeded last-week Thu 22 Oct 2:00, then PUT +7d (same as the button). GET showed both 22 and 29 Oct 120 minutes. UI **Copy last week** clicked with no error toast. Weekly grid still shows the weekly Website 2:30 (copied rows keep their saved daily period). | |
| F-04 | Mark a working day Leave; cells lock Off; day total Leave; Reports Off + expected drop | pass | After clear, `PUT /timesheets/days-off` Leave/Other 200. GET daysOff `kind: other` then Leave. Reports This week: owner Off 2 (Mon-Tue), expected 3 after 5 working days minus 2 offs. UI helper: "5 working days, minus 2 days off = 3 days". Month missing line: `on leave Mon 26 - Tue 27 Oct` (not listed as missing). | |
| F-05 | Leave on a day that already has time | pass | `PUT /timesheets/days-off` Fri 30 with 180 minutes: **409** `Clear the time logged on this day before you mark it as a day off.` GET still 180 minutes. | |
| F-06 | Clear time, mark Other, then Back; can type again | pass | Clear + Other 200. Time while Other: **409** `This day is marked as a day off. Change it back to a working day first.` Clear off then PUT 45 minutes 200. | |
| F-07 | Weekend header: not a working day; cannot mark off | pass | Sat 31 Oct Leave: **409** `That date is not a working day.` Workspace was daily for this check. Live default is weekly, so the daily weekend header was not on screen in this pass. | |
| F-08 | Add public holiday; grid shows Holiday; typing time still saves as extra | pass | After clearing leftover Other on the date: holiday Wed 28 then Fri 6 Nov. GET holidays include the date. Time on 6 Nov: 200 saved 90 minutes. Reports week 2-8 Nov: 1:30 logged, expected 0 (holiday + future cap), missing list empty. First attempt on 28 Oct failed 409 because a leftover day-off already sat on that date - not a holiday-time bug. | |
| F-09 | Weekly mode: days-off count; server places first working non-holiday days | pass | `PUT /timesheets/days-off` `{week:{weekStart:2026-10-26,count:2,kind:leave}}` 200 `placed:["2026-10-26","2026-10-27"]` (skipped Wed holiday). UI count 2, Type Leave, note `weekly count`. | |
| F-10 | Switch period/unit in General; old rows keep saved unit; banner | pass | `PATCH /workspace` unit percent. GET Fri row still `unit:time` minutes 45. General copy: "Changing these doesn't change saved timesheets. Each entry keeps the period and unit it was saved with..." Restored weekly/time. | |
| F-11 | Member: own sheet only; cannot read another userId | pass | Member PUT own 200. `GET /timesheets?userId=<owner>` **403** `You can only read timesheets for projects you lead.` PUT has no userId field; writes always use the session user. | |
| F-12 | Lead: Viewing picker; Off without kind/note; only their projects | pass | Lead created QTL (leadId self). `GET /timesheets?userId=<owner>` 200: QTL 35 minutes only, no Website row. daysOff `[{date,label:Off},{...}]` with no kind/note. Owner UI has Viewing. Lead UI not clicked this pass (API proved the payload). | |
| F-13 | Guest/viewer: no Timesheets nav; no write | pass | Guest PUT **403** `Guests and viewers cannot log time.` GET own sheet 200 empty. Direct `/timesheets`: "Timesheets are for workspace members" / "Guests and viewers don't log time in BornTask." Bottom nav on this narrow pane had no Timesheets (same as owner on this pane). | |
| F-14 | Reports period chips and project filter change totals | pass | `GET /reports/workspace` Oct: tasks opened 18 vs Website-only 16. UI This month Time logged 7:55 / Opened 18. This week chip: Opened 4, Time logged 5:55. | |
| F-15 | Completeness after two leave days | pass | Short week with holiday + two Leave + time on remaining expected days: `complete:1`, owner `expected:1`, `missing:0`. Month view: owner 6/20, 0 complete (not every remaining day logged). Formula is expected = working days up to today - holidays - days off. | |
| F-16 | Missing list uses expected days only | pass | October missing spans are weekdays only (Thu 1 - Fri 2, Mon 5 - Fri 9, ...). Leave days appear as `on leave ...`, not as Missing. Weekends and Sat 31 not listed. Holiday week with only extra holiday time: `missing:[]`. | |
| F-17 | Member opening reports URL: no data fetch / not owner-admin | pass | Member `GET /reports/workspace` **403** `Owners and admins only.` Guest `/settings/reports`: "Reports are for workspace owners and admins..." No tiles / no numbers. | |
| F-18 | Working-day chips change expected days and weekend columns | pass | `PATCH` workingDays Mon-Thu. Leave on Fri 23 Oct: **409** not a working day. Restored Mon-Fri. Did not re-open the daily grid after the chip change in the UI. | |
| F-19 | Holiday add, remove, copy to next year; movable-date warning | pass | UI + Add holiday saved **QA Republic Day UI** 13 Nov 2026 (Remove button present). API copy 2026→2027: 200 `{copied:2,skippedMovable:[{date:2026-04-03,name:Good Friday}]}`. 2027 GET had the fixed date, not Good Friday. UI Copy to 2027 clicked; no movable-warning string in the a11y tree this pass (no Easter name on the live 2026 list). | |

No P0. First-pass F-13/F-31 misses were dirty leftover days-off on the probe dates; retests passed. Leftover QA people, QTL, and the 13 Nov holiday are cleanup, not product defects.

Chat 7: all F-01–F-19 stay **pass**. Reports now lives at `/reports` (sidebar under Timesheets, `canAdmin` only). `/settings/reports` redirects. Members still must not fetch (`useWorkspaceReports` stays gated).

Owner re-pass (31 Oct 2026): created `chat7.owner@borntask.com` / workspace **Chat 7 QA**. Sidebar My tasks, Timesheets, Reports. Settings nav has no Reports. `/settings/reports` redirected to `/reports`. TR2-01: dirty A day + add Christmas Day left Unsaved changes and the holiday row. TR2-10: weekly helper `5 working days, minus 1 holiday = 4 days` and max `(4 here)` after QA holiday on 30 Oct. TR2-13: month line `21 expected working days so far (after subtracting QA holiday; days off come off each person)`.

Holiday add/remove now POST/DELETE one date so a stale year list cannot wipe other holidays. Command palette and the You sheet only offer Timesheets / Reports to people who can open them.
