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
| QA-05 | Search (`Search.dc.html`) | P0 | Not broken on mocks. `checkout` grouped hits, chips, filters, query kept in the top bar. | n/a | Placeholder still says jump to `WEB-142`. That key is not in the seed. Live `checkout` returns one hit: WEB-1. |
| QA-06 | Search heading | P1 | Heading flashed `0 results for "checkout"` while the query was in flight. | Y | - |
| QA-07 | Search snippet | P2 | Mock description snippet started mid-word (`…he promised`). Web `snippetAround` snaps to a word. | N | Live API still slices mid-word. WEB-1 description search for `checkout` showed `…he promised window should be shown on the checkout summary step before the customer pays.` |
| QA-08 | WEB-142 jump | P0 | Not broken on mocks. Top bar `WEB-142` opened the drawer. | n/a | Seed key is WEB-1. The search tip and placeholder still name WEB-142. |
| QA-09 | Command palette (`CommandPalette.dc.html`) | - | Ctrl/Cmd K overlay, Esc, actions. `apple` → WEB-139 + New task named "apple" (mock pass). | n/a | Not re-run on live data. No "Tab to filter by project". Footer hints wrap on narrow width. |
| QA-10 | Projects (`Projects.dc.html`) | P1 | New project used brand green; spec is ink (`#121417`). | Y | No category stacked bars. Live card shows lead name (`BornTask Owner`) and `1 open`. Cards stack on narrow width. |
| QA-11 | Admin People (`AdminPeople.dc.html`) | P1 | Subtitle said `1 people`. | Y | Subtitle is now `BornTask · 2 people` (owner + QA Guest). Sign-in domain chips from `AdminPeople.dc.html` are still missing. No Billing, Profile, or API tokens in the settings nav. |
| QA-12 | Workflow (`WorkflowEditor.dc.html`) | - | Delivery stages and moves load for the owner. Add stage and Remove both save. | n/a | Added `QA probe`, saved, reloaded, removed it, saved. Delivery is back to Idea, Approved, WIP, Ready for testing, Testing, Deployed, On hold, Rejected (12 moves). No role editor on a move beyond the comment checkbox. |
| QA-13 | Create workspace (`CreateWorkspace.dc.html`) | - | Stepper + copy match. | n/a | No 14-day trial note (billing, out of scope). |
| QA-14 | Welcome member (`WelcomeMember.dc.html`) | - | Empty My tasks copy + project cards. | n/a | Standalone route, not the in-app shell empty state. |
| QA-15 | Welcome guest / Accept invite / Wrong account | P2 | Owner opening a guest invite URL goes to wrong-account. Matching email accepts and lands on welcome guest. | Y | Wrong-account heading is "a different email". Spec shows both addresses, a Different account chip, and "Ask for an invitation to {email}". Ask-for-invite did succeed. Welcome says "as a guest" because the invite set no project role. Spec shows Business and an ideas list. |
| QA-16 | Import / Create project / Defaults / Workspace general | P2 | Screens load on the live API. Copy and fields are a cut-down of the `.dc.html` files. | N | See the evening comparison below. |
| QA-17 | Sidebar vs Search.dc.html | P2 | Search + Favourites + Settings present. On this pane the nav wraps into a horizontal strip. | N | Spec is a 272px left column at 1440. Banner remains while `VITE_USE_MOCKS=true`. |
| QA-18 | Live vs mock after login | P2 | With both mock flags false, the owner sees seed project **Website (WEB)**, not Scope sample projects (no MOB, no CLI). | Y | Banner still says "Live API with mock fallback" and still tells you to set the two flags that are already false. Tag in the top bar: `API + fallback`. |

## Evening comparison vs `.dc.html`

Import (`Import.dc.html`): project picker listed Website (WEB). A one-row CSV mapped Task ID, Name, Notes, Assignee Email, and Section, and previewed that row. XLSX is rejected: "Save the Asana export as CSV for now. XLSX parsing is not bundled yet." Missing vs spec: four-step stepper, file chip, "sections become statuses" toggle, status map, people card. The unknown-email warning listed `guest@qa.borntask.test` even though that guest is already in the workspace, and the copy said "1 emails". Import was not started.

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

Sheets, Chat, MCP, billing, GitHub, Plesk, XLSX parsing, API snippet word boundary, import unknown-email filter, create-project dialog vs spec, sign-in domain chips, delete workspace.
