# Design gaps (14 October 2026)

App: http://localhost:5174, signed in as owner@borntask.com (existing session). Layout measured at 1440×900, the design-canvas size. The browser capture pane is about 598×458, so screenshots show the top-left of that layout unless a region was clipped out. Mocks: `VITE_USE_MOCKS=true`, with `VITE_MOCK_PROJECTS=false` and `VITE_MOCK_TASKS=false`. The shell reports **Live API with mock fallback** (projects live, tasks live). Notifications still come from the mock fixture. Data is the internal BornTask workspace: project **Website** (WEB), one task **WEB-1**.

Spec files are `apps/web/docs/design/*.dc.html`. Tokens: `apps/web/src/theme/tokens.ts`. Brand green `#178A5C`, UI font DM Sans, display Sora. The paragraphs below are the audit. The Fixed section records the later code pass.

## Summary

| Type | Count |
| --- | --- |
| Missing feature | 23 |
| Visual | 10 |
| Copy | 17 |
| Extra (live has it, spec does not) | 2 |
| Local-dev only | 3 |
| Out of scope (billing v1.2) | 2 |
| Later (Chat, MCP, GitHub, mobile, emails) | 4 |

No P0. Daily-driver gaps are the list and board filters, the task drawer (reporter and description toolbar), bulk selection, the unknown-project state, wrong-account copy, and XLSX import.

## Fixed (14 October 2026)

IDs stay in the tables below. **Fixed** means the live screen now matches the artboard for that row. GAP-03 is a product decision, not a copy revert.

| ID | What changed |
| --- | --- |
| GAP-16, GAP-17, GAP-28, GAP-29 | Filter builder, chips, saved views, group, sort, and the same bar on the board. Columns can be Status, Section, Assignee or Priority. The address bar holds the filters. |
| GAP-18 | List column headers and + Add section. |
| GAP-20, GAP-21, GAP-22 | Reporter row, description toolbar (bold, italic, lists, code, link, mention), and You can moves for the next allowed stages. |
| GAP-23, GAP-25, GAP-57 | Assignee shows the project role. Comments and Activity are separate tabs. Due placeholder is No date. A missing task offers Back to My tasks. Section headings stay uppercase, matching TaskDetail.dc.html. |
| GAP-27 | Row checkboxes and the bulk bar: Move to, Assign, Due date, Section, Labels, Delete. |
| GAP-30 | On hold and Rejected are collapsed rails on the board. |
| GAP-10 | When tasks are live, the bell reads workspace notifications instead of the design fixture. |
| GAP-38 | CSV and XLSX uploads. The first sheet is mapped. |
| GAP-56 | Wrong-account screen shows both addresses when the invitation exists, plus Nothing has been joined. |
| GAP-58 | An unknown project shows You're not on this project and Request access. |
| GAP-01, GAP-04 | Sign-in panel matches the artboard spacing, headline and idea-to-tick mark. Google and Microsoft buttons carry G and M marks. Self-serve copy (GAP-03) stays. |
| GAP-06, GAP-07 | Workflow choices are bordered cards with the full status lines. |
| GAP-11 | Avatar menu shows name, email, profile, tokens, keyboard shortcuts and sign out. `?` opens the shortcut sheet. |
| GAP-32 | Quick add always shows assignee, due and priority chips. |
| GAP-34, GAP-35 | Command palette keeps the other actions while searching, with shortcut hints and Switch to board view. |
| GAP-39, GAP-41 | Trash says tasks are kept 30 days, then removed for good, with who deleted the task and time left. |
| GAP-40 | Project sections can be dragged to reorder. |
| GAP-43 | Settings pages have a back link. |
| GAP-48 | Defaults can add a role, add a type and create a new workflow. Captions include who can move tasks and how many projects use it. |
| GAP-49, GAP-50 | Workspace logo upload, and delete workspace after the owner types the name. Data is kept 30 days. |
| GAP-59 | Task drawer pickers filter as you type, close with Esc, show the project role, a calendar and priority keys. |
| GAP-60 | A blocked board drop stays on the board with Ask and Override. A successful move has an undo toast. |

## By screen

### Sign in — SignIn.dc.html — /sign-in

Opened signed-out (then the session was already valid for later routes). Brand panel is green `#178A5C`, wordmark "borntask", Sora headline, DM Sans body.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-01 | P2 | visual | Left panel padding 48px 56px, headline 40px, min-height 360px, idea-to-tick illustration | Padding 32px 40px, headline 32px, min-height 220px, no illustration | **Fixed.** Padding, 40px headline, 360px panel and the idea-to-tick mark. |
| GAP-02 | P2 | copy | Footer "Scope Cloud Solutions" | Footer "BornTask" | |
| GAP-03 | P1 | copy | "Use the work account you were invited with." Divider "No account yet?". Invitation-only paragraph. Terms and Privacy policy. | "Continue with Google or Microsoft. A new account sets up a workspace next." Then "No invite is required to start..." | Decision: keep the self-serve copy. Do not restore invitation-only wording. Terms and Privacy have no page in this app, so they were not invented. |
| GAP-04 | P2 | visual | Google and Microsoft buttons 48px, radius 10px, weight 600, with G and M marks | Ant Design buttons, about 45px, radius 12px, weight 400, no marks. Microsoft disabled in this environment. | **Fixed.** 48px buttons, weight 600, G and M marks. Radius is 10px. |
| GAP-05 | Later | local-dev | No email form | Name, Email, and "Developer sign-in" when `devLogin` is on | Local only. |

### Create workspace — CreateWorkspace.dc.html — /create-workspace

Reached while already signed in as owner@borntask.com. Did not submit the form.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-06 | P2 | visual | Workflow choices are bordered cards with a title and a second line | Plain radio lines | **Fixed.** Bordered cards. |
| GAP-07 | P2 | copy | "Software delivery" plus "Idea → Approved → WIP → Ready for testing → Testing → Deployed, with roles". "Simple tasks" plus "To do → Doing → Done, anyone can move tasks" | "Software delivery - Idea to Deployed, with roles". "Simple tasks - To do, Doing, Done" | **Fixed.** Full status lines, including anyone can move tasks. |
| GAP-08 | Later | out of scope | Trial note: "14-day free trial. Then €1 per member per month. Guests are always free. No card needed to start." | Not on the step list | Billing v1.2. |
| GAP-09 | P2 | visual | Spec paints step 1 only; steps 2 and 3 are labels | Live step 2 is "Invite your team" (emails). Step 3 is "First project" then "Create workspace" | Seen in code; not clicked, so a workspace was not created. |

### Shell — Main.dc.html, SheetTopBar.dc.html — all signed-in routes

| ID | Severity | Type | Spec | Live | Notes |
| GAP-10 | P2 | local-dev | Bell with Unread / All, Mark all read, and rows for tasks in this workspace | The bell is present and the panel matches: Unread 3, All, Mark all read, profile link. Rows are the design fixture (WEB-142, WEB-139, WEB-133, Maria Borg, Luke Camilleri, Karl Farrugia) | **Fixed.** When tasks are live, the bell uses `/me/notifications`. An empty live list stays empty instead of showing mock keys. |
| GAP-11 | P2 | missing | Avatar menu: name and email, Profile and notifications, Connected apps and tokens, Keyboard shortcuts (?), Sign out | Avatar menu is a settings jump-list (Projects, People, defaults, workspace, workflow, billing, profile, tokens) plus Sign out. No keyboard-shortcuts sheet | **Fixed.** The menu matches the artboard. `?` opens the sheet. G then M and V are wired. |
| GAP-12 | P2 | visual | Favourites are project rows with a colour dot | Empty state "Star a project to pin it here." Website is not starred, so the row is absent | Empty state is fine; spec's populated favourites need a star. |
| GAP-13 | Later | local-dev | No mock banner | Amber note "Live API with mock fallback..." in the sidebar, and a gold "API + fallback" tag in the top bar | Uses amber and gold, outside the brand green palette. Local only. |
| GAP-26 | P2 | visual | Workspace switcher: avatar tile, name, role, tick, Workspace settings | A plain name button. Menu is workspace names plus "Create workspace" | One workspace in this session, so a second workspace row could not be checked. |
| GAP-27 | P1 | missing | Bulk bar when list rows are selected: Move to, Assign, Due date, Section, Labels, Delete | No row selection, so the bar never appears | **Fixed.** Checkbox on each row. Move to only offers a stage allowed for every selected task. |
| GAP-31 | P2 | extra | Main sidebar has Favourites, not a Recent group | After opening Website, a Recent group lists it | |

### My tasks — Main.dc.html, WelcomeMember.dc.html — /

Owner has 0 assigned tasks, so the populated Main artboard (groups of task rows, "7 open across 4 projects") is not on screen. The empty state matches WelcomeMember more than Main.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-14 | P2 | copy | WelcomeMember: "sorted by what's due first" and a "You've joined {workspace}" toast | "sorted by what is due first". No join toast unless `?welcome=` is set | Populated My tasks columns (key, title, type, project, status, due) were not visible because nothing is assigned. |
| GAP-15 | P2 | missing | Main date line "7 open across 4 projects" | "Wednesday 14 October · 0 open" | "across N projects" is omitted at zero. My tasks count badge is hidden when the count is 0. |

### Project list — ListView.dc.html, SheetFilters.dc.html — /p/WEB/list

Header: "Projects / WEB", "Website", star, invite, tabs List / Board / Trash / Members / Sections. One row: WEB-1 "Seed task for internal workspace", Bug, Approved, Unassigned, No date, No priority. Section "Inbox" with "+ Add task to Inbox".

| ID | Severity | Type | Spec | Live | Notes |
| GAP-16 | P1 | missing | Saved views ("Bugs to test", "Business approvals"), "+ Save view", and a Filter button that opens the filter builder (type, status, status category, section, assignee, reporter, role, priority, labels, due, created, updated, text). URL holds the view. | Two Ant selects: "Any type" and "Anyone" (Anyone / Assigned to me / Unassigned), plus a switch "Show Deployed and Rejected" | **Fixed.** Filter button, chips, and + Save view. Views are saved in this browser. The URL holds the filters. |
| GAP-17 | P1 | missing | Group (Section) and Sort (Manual) controls | Static text "Grouped by section · drag ⋮⋮ to reorder" | **Fixed.** Group and Sort menus. Drag reorder stays on when grouping is Section and sort is Manual. |
| GAP-18 | P2 | missing | "+ Add section" on the list. Column header row Task / Type / Status / Assignee / Due / Priority | Add-task only. No column header row | **Fixed.** Header row and + Add section. |
| GAP-19 | P2 | copy | Spec project title "Website relaunch" and a "Project settings" entry | Title is the live name "Website". Settings are split into Trash, Members, and Sections tabs | Data name is not a gap. The settings entry point differs from the artboard. |

### Task drawer — TaskDetail.dc.html — /p/WEB/list?task=WEB-1

Drawer is 600px on the right. Breadcrumb "Website / Inbox / WEB-1", green "Saved", title "Seed task for internal workspace", status pill Approved, fields Type, Assignee, Due, Priority, Section, Labels, description, attachments, subtasks, comments, Delete task.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-20 | P1 | missing | Reporter row ("Daniela Vella · 3 Oct") | No reporter field | **Fixed.** Reporter name and the created date. |
| GAP-21 | P1 | missing | Description toolbar: bold, italic, numbered list, bullets, code, link, @ | Plain textarea. Placeholder "Add details. Markdown and @mentions work here." | **Fixed.** Toolbar inserts Markdown. Not a full Tiptap editor. |
| GAP-22 | P2 | visual | Status leads with "You can:" actions such as "Pass · Deployed", "Fail · back to WIP", "On hold" | Status is a pill menu ("Approved"). On this Approved task the "You can:" row is absent | **Fixed.** You can lists the next moves this person is allowed to make, including On hold when it has no custom label. |
| GAP-23 | P2 | visual | Assignee shows name, project role, and Change. Section titles are sentence case. Comments and Activity are separate. Title is plain display type | Assignee is an "Unassigned" select with no role. Sections are uppercase (DESCRIPTION, ATTACHMENTS, SUBTASKS, COMMENTS AND ACTIVITY). Comments and activity are one feed. Title sits in a grey filled input | **Fixed** for the role, the display title, and Comments / Activity tabs. Headings stay uppercase because TaskDetail.dc.html uses uppercase. |
| GAP-24 | P2 | extra | Spec header is breadcrumb + Saved + close | Extra "Watch" and "Copy link" | Not in TaskDetail.dc.html. |
| GAP-25 | P2 | copy | Due reads like "Today, 11 Oct" | Empty due shows Ant Design "Select date" | **Fixed.** Empty due says No date. |
| GAP-57 | P2 | copy | SheetStates task-not-found button "Back to My tasks" | `/p/WEB/list?task=WEB-999` shows "{key} doesn't exist or was deleted", the 30-day trash sentence, and Close | **Fixed.** The button is Back to My tasks. |

### Board — BoardView.dc.html, SheetFilters.dc.html — /p/WEB/board

Columns follow the delivery workflow. WEB-1 sits in Approved. Each column has "+ Add". There is no filter bar.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-28 | P1 | missing | Filter button, shared with the list (SheetFilters) | No type, status, or assignee filters | **Fixed.** Same filter bar as the list. |
| GAP-29 | P2 | missing | Saved view "Bugs to test", a Columns control set to Status | No saved views and no Columns control | **Fixed.** Saved views and a Columns control. Default is Status. |
| GAP-30 | P2 | visual | On hold and Rejected are collapsed dashed vertical rails | Both are full columns, 220px when marked side, with a 0 count | **Fixed.** Rails expand when clicked. A drop on a rail still moves the card. |

### Quick add — QuickAdd.dc.html — Q

Opened with the Q shortcut. Dialog: type Idea / Bug / Improvement / Feature, title, description with an Idea template and Clear template, project Website · Inbox, Status: Idea, attach, Create and open (Shift+Enter), Create task (Enter).

| ID | Severity | Type | Spec | Live | Notes |
| GAP-32 | P2 | missing | Assignee, due, and priority chips are visible (example: Karl, Fri 16 Oct, High) | Those chips appear only after the title is parsed (`@`, a date, `!`) | **Fixed.** The three chips stay visible. Empty values read Unassigned, No date and No priority. |
| GAP-33 | P2 | copy | Hint is "@ ! dates" without a type token | Hint includes "# for type" | |

### Command palette — CommandPalette.dc.html — Ctrl+K

Empty state: New task, New project, Go to My tasks, Search, Go to Projects, Go to Website, arrows, Enter, Tab to filter by project. Query "checkout" lists WEB-1 and "New task named checkout".

| ID | Severity | Type | Spec | Live | Notes |
| GAP-34 | P2 | missing | Per-row shortcut hints (Q, G then M, V) and "Switch to board view" | No shortcut hints. No board-view action | **Fixed.** |
| GAP-35 | P2 | missing | A query still lists the other actions | A query hides actions whose labels do not contain the text | **Fixed.** Task hits still filter. Actions stay listed. |

### Search — Search.dc.html — /search?q=checkout

Matches the artboard. "1 result for checkout" in titles, descriptions and comments, with a timing, All projects, Any type, Any status, Include Deployed and Rejected, a Website group, and WEB-1 with a description hit, type Bug, status Approved. Tip: type a task key like WEB-142. Project list and board filters are GAP-16 (fixed). An empty query was not tried.

### Projects — Projects.dc.html — /projects

Close to the artboard. Active / Archived, Import, New project in ink `#121417` (the spec button is ink, not brand green). Card: WEB Website, lead, "1 guest", "1 open", "0 in review", "0 deployed", "Yesterday", category bar and legend. Counts are the live data.

### Create project — CreateProject.dc.html — /projects/new

Dialog over the projects list. Name, key placeholder HLP, colour swatches (Green selected), workflow select "Delivery: Idea to Deployed, plus On hold and Rejected" (Simple is in the select), sections Inbox and + Section, owner as Project lead, invite by email, guest copy. Not submitted.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-36 | P2 | copy | "Add a person or invite by email", with role chips Business, Developer, Tester, Observer | Placeholder "Add a person already in the workspace", plus a separate email field | |
| GAP-37 | P2 | copy | Role chips use title case | After a person is added, the "+ role" options are the raw slugs `business`, `developer`, `tester`, `observer` | |

### Import — Import.dc.html, SheetImport.dc.html — /import

Step labels Upload, Map columns, Preview, Import are present. Stopped on step 1. Did not upload a file, so preview, progress, and done were not seen.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-38 | P1 | missing | Map step shows an uploaded .xlsx | "Choose CSV" and "Save the Asana export as CSV. XLSX is not parsed yet." | **Fixed.** Choose CSV or XLSX. The first sheet is turned into rows for the map step. |

### Trash — /p/WEB/trash

"Trash · WEB", "Deleted tasks stay here for 30 days.", "Trash is empty." No project tabs on this page (the list header is how you get here).

| ID | Severity | Type | Spec | Live | Notes |
| GAP-39 | P2 | copy | Kept for 30 days, then removed for good, with deleted-by and time left | "Deleted tasks stay here for 30 days." Empty state "Trash is empty." | **Fixed.** The sentence matches, and a deleted task shows who deleted it and the days left. |

### Project structure — /p/WEB/settings/structure

Heading matches. Inbox with Move up / Move down, Rename, Delete, + Add section. Task type switches for idea, bug, improvement, and feature, with templates. Trash 0, "Trash is empty."

| ID | Severity | Type | Spec | Live | Notes |
| GAP-40 | P2 | missing | "Drag to reorder" | Up and down buttons | **Fixed.** Drag the handle. The arrows remain for keyboard use. |
| GAP-41 | P2 | copy | Trash on this page says tasks are kept 30 days, then removed for good | "Trash is empty." with no 30-day sentence | **Fixed.** The structure page says tasks are kept for 30 days, then removed for good. |

### Project members — /p/WEB/settings/members

Heading, "Project roles decide who can move tasks between stages.", Invite people, columns Person / Project roles / Workspace role. QA Guest is listed. Owner is not in the project member list (data). Pending invitations: none, so resend and revoke were not seen. Settings nav groups Website, Workspace, You match the spec labels.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-42 | P2 | copy | Workspace role in sentence case | Workspace role text "guest" | |
| GAP-43 | P2 | missing | "← Back to ..." on settings pages | No back link on project or workspace settings | **Fixed.** Back to the project, or back to My tasks on workspace settings. |

### Workflow — WorkflowEditor.dc.html, SheetWorkflow.dc.html — /p/WEB/settings/workflow and /settings/workflow

Both routes open the same editor. "Delivery · used by 1 project. Owner and admin only." Save workflow. Stages table: name, category, WIP limit, tasks, with up, down, drag, and remove. Moves include Idea → Approved (Business / Project lead, Approve, Comment required), through Testing → Deployed (Pass) and Testing → WIP (Fail). On hold is "Any member". + Add a move. + Add stage appends an inline "New stage" row (local only; not saved).

| ID | Severity | Type | Spec | Live | Notes |
| GAP-44 | P2 | missing | "+ Add stage" and "+ Add a move" open dialogs (name, category, place after, WIP limit, notify assignee, notify role) | Inline rows. A move has a Comment checkbox only | The removal banner for a stage that still has tasks exists in code and was not opened. |

### Google Chat — GoogleChat.dc.html, SheetGoogleChat.dc.html — /p/WEB/settings/chat

The screen exists. Controls are disabled. "Not connected. Paste a space webhook when Chat posting is enabled in the worker." Event checkboxes match the spec. Message preview is a stub: "BornTask · App / Website / A task was assigned". Save is disabled.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-45 | Later | Later | Connected space, Send test message, Disconnect, the three-step setup guide, and the v2 Chat-app footnote | Disabled webhook form and a stub preview | Behaviour was not implemented, by request. The screen is still short of the artboard. |

### GitHub — GitHubSettings.dc.html, SheetGitHub.dc.html — /p/WEB/settings/github

The screen exists. "GitHub App is not installed yet." Install is disabled. "How tasks are recognised" shows `{projectKey}-142` and a read-only suggested branch `{type}/{key}-{title}`.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-46 | Later | Later | Connected org, repos, auto-move rules, recent events, and "Testing or Deployed is never automatic" | Not-installed stub | Behaviour was not implemented, by request. |

### People — AdminPeople.dc.html — /settings/people

"BornTask · 1 member · 1 guest", Invite, sign-in copy, domain borntask.com, + Add domain. Table: Person / Workspace role / Signs in with / Projects. Owner and QA Guest both show no sign-in provider. Pending invitations: 0.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-47 | P2 | copy | Signs in with shows Google or Microsoft | Signs in with is "-" | |

### Defaults — AdminDefaults.dc.html — /settings/defaults

Role names and descriptions match. Delivery is listed as 8 stages and 12 moves. Simple is 3 stages and 4 moves. "Open editor" links to the workflow page.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-48 | P2 | missing | + Add role, + Add type, New workflow. Captions include "used by N projects" and "anyone can move tasks" | No add buttons. "Open editor" instead of New workflow. Those second lines are absent | **Fixed.** Add role, add type and New workflow. Template rows use a Template line. Open workflows say anyone can move tasks. |

### Workspace — WorkspaceGeneral.dc.html — /settings/workspace

Name BornTask, slug internal, .borntask.com, Europe/Malta, Monday, Delivery, Bugs start in Approved. Security checkboxes match. Save is present. Did not save.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-49 | P2 | missing | Upload logo | "Logo upload is not available yet." No button | **Fixed.** Upload logo stores the image for this workspace. |
| GAP-50 | P2 | missing | Delete workspace: the owner types the name, then 30 days | No delete section | **Fixed.** The owner types the name. The workspace closes now and is removed after 30 days. |

### Billing — AdminBilling.dc.html, SheetBillingStates.dc.html — /settings/billing

The screen exists. "Visible to workspace owners and admins. Card collection is not connected yet." €1 per member, Active, paid seats, free guests, VAT, the mid-month sentence, and a next-invoice note. "A payment card is not on file."

| ID | Severity | Type | Spec | Live | Notes |
| GAP-51 | Later | out of scope | Card form, billing details, invoices, export, cancel subscription. SheetBillingStates: an internal workspace does not show trial or payment banners | Pricing and seat counts only. This internal workspace still shows the billing page | Billing v1.2. Card collection was not implemented, by request. |

### Profile — ProfileSettings.dc.html — /settings/profile

Display name, time zone Europe/Malta, the signed-in sentence, Notify me when (In app / Email / Google Chat), the v2 Chat footnote, and Daily digest (Workdays at 08:00 / Every day / Off). Google Chat checkboxes are disabled. That matches the v2 note.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-52 | P2 | copy | Time zone "Europe/Malta (CEST)". Profile fields save | "Europe/Malta". "Saving profile fields is not wired yet." | No separate save for the notification grid. |

### API tokens — ApiTokens.dc.html, McpConsent.dc.html, McpConnected.dc.html — /settings/tokens

The page exists. Create token is disabled. "No personal tokens yet. Token minting is not wired in this stage. MCP is a stub at the server URL below." Server URL `https://[mcp-host].borntask.com/mcp`. Planned tools: list_tasks, get_task, create_task, update_task, move_task, add_comment, search. Activity note "via MCP" is present.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-53 | Later | Later | A created token with Copy. Consent and connected MCP screens | Create token disabled. McpConsent and McpConnected have no routes | MCP behaviour was not implemented, by request. |

### Welcome — WelcomeMember.dc.html, WelcomeGuest.dc.html — /welcome/member, /welcome/guest, /?welcome=guest

`/welcome/member` and `/welcome/guest` redirect to `/?welcome=member` and `/?welcome=guest`. The guest query rendered a welcome card for the owner: "Welcome, BornTask. You're in." and "You joined Website as a guest." Got it, Dismiss, an empty "Nothing is waiting for you.", and In progress with WEB-1 and Open board. The shell stayed the owner chrome (Projects, Settings).

| ID | Severity | Type | Spec | Live | Notes |
| GAP-54 | P2 | visual | Guest chrome, and a role-specific card (a guest, or Business "Approve ideas" when the invite role is stored) | Owner shell. The card says "a guest" because no invite was stored. First name is "BornTask" | `/?welcome=member` uses the My tasks empty state (GAP-14) plus the "You've joined" toast. |

### Accept invite — AcceptInvite.dc.html — /invite/:token

A fake token (`/invite/not-a-real-token`) shows "This invitation was not found." The happy path and the expired state need a real invitation, so they were not opened. The screen code does include invited-by, role, Sign in to accept / Accept invitation, and an Expired badge.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-55 | P2 | copy | Full invite card: both providers, expiry date, "Ask for a new invitation" | Unknown token is an error alert only. The coded happy path is shorter than the artboard (no provider pair, no expiry date) | |

### Wrong account — WrongAccount.dc.html — /invite/:token/wrong-account

Opened with the same fake token, while signed in as owner@borntask.com.

| ID | Severity | Type | Spec | Live | Notes |
| GAP-56 | P1 | copy | Both email addresses, "Nothing has been joined.", and "Different account" | "This invitation is for a different email." "You are signed in with an account that does not match the invited address." Buttons: "Ask for an invite to this address", "Switch account", "Back to sign in" | **Fixed.** Invited and Signed in as come from the invitation. A fake token still says it was not found. |

### Unknown project — SheetStates.dc.html — /p/NOPE/list

| ID | Severity | Type | Spec | Live | Notes |
| GAP-58 | P1 | missing | "You're not on this project" and Request access | The main area stays on an Ant Design skeleton. No alert after waiting | **Fixed.** List and board show the message and Request access. A missing key says it is not in this workspace. |

### Sheets that are not their own route

| ID | Severity | Type | Spec | Live | Notes |
| GAP-59 | P2 | missing | SheetPickers: type-to-filter, Esc, role on the assignee, calendar, priority keys | Status, assignee, due, priority, and labels are Ant Design selects | **Fixed** in the task drawer. Type, status, assignee, due, priority and labels filter as you type and close with Esc. Assignee shows the project role. Due is a calendar. Priority uses keys 1-4 and 0. |
| GAP-60 | P2 | missing | SheetDragDrop: a blocked drop is an in-board card; a successful move has an undo toast | Code shows an Ant notification ("Only {roles} can move tasks to {status}", Ask, Override for leads) and a toast "{key} moved to {status}" | **Fixed** for a board drop. The card stays on the board with Ask and Override. A successful move shows an undo toast for the person's own recent move. |
| GAP-61 | Later | Later | SheetEmails, SheetMobile | No in-app route for the email templates. Phone width was not checked (viewport stayed 1440) | |

Also not opened as their own screens, and already counted above: SheetFilters (GAP-16, GAP-28), SheetTopBar bulk bar (GAP-27) and shortcuts (GAP-11), SheetWorkflow (GAP-44), SheetImport steps 3-4 (GAP-38), SheetGoogleChat (GAP-45), SheetGitHub (GAP-46), SheetBillingStates (GAP-51), McpConsent and McpConnected (GAP-53). Invite people is a button on members; the modal was not opened. SheetApprovals "Needs your approval" was not on My tasks because nothing is waiting; Idea tasks get Approve / Reject in the drawer (GAP-22).

## Priority list for a later fix chat

Closed on 14 October (see Fixed): GAP-10, GAP-16, GAP-17, GAP-18, GAP-20, GAP-21, GAP-22, GAP-23, GAP-25, GAP-27, GAP-28, GAP-29, GAP-30, GAP-38, GAP-56, GAP-57, GAP-58.

Still open as P1:

1. **Sign-in story** (GAP-03). Decision: keep the self-serve copy ("no invite required"). Terms and Privacy still have no page, so they were not added.

Polish closed on 15 October: GAP-01, GAP-04, GAP-06, GAP-07, GAP-11, GAP-32, GAP-34, GAP-35, GAP-39, GAP-40, GAP-41, GAP-43, GAP-48, GAP-49, GAP-50, GAP-59, GAP-60.

Invitation email is sent through the worker when `SENDGRID_API_KEY` is set. GAP-61 stays open: the daily digest and the phone sheet are not in this pass.

Leave for their own stages.

- Billing trial, card, invoices, export, cancel (GAP-08, GAP-51).
- Google Chat connect, test, and disconnect (GAP-45).
- GitHub install, repos, and auto-move (GAP-46).
- Token minting, MCP consent, and MCP connected (GAP-53).
- Email templates and the phone sheet (GAP-61).
- Developer sign-in and the mock banner (GAP-05, GAP-13).
