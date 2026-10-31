# Design references

Static markup exported from the BornTask design canvas. They are the visual spec, not code to copy:
build each screen with Ant Design components and `src/theme/tokens.ts`, matching spacing, copy and states.
Files use a canvas wrapper (`<x-dc>`, `support.js`), so read them as markup; they will not open cleanly on their own.

| File | Screen | Status in `apps/web` |
|---|---|---|
| `Main.dc.html` | My tasks | Built → `src/screens/MyTasksScreen.tsx` |
| `Timesheets.dc.html` | Timesheets | Built → `src/screens/TimesheetsScreen.tsx` |
| `ListView.dc.html` | Project · List view | Built → `src/screens/ProjectListScreen.tsx` |
| `BoardView.dc.html` | Project · Board view | Built → `src/screens/ProjectBoardScreen.tsx` |
| `TaskDetail.dc.html` | Task detail drawer | Built → `src/components/TaskDrawer.tsx` |
| `QuickAdd.dc.html` | Quick add (Q) | Built → `src/components/QuickAdd.tsx` |
| `CommandPalette.dc.html` | Command palette (Ctrl/Cmd K) | Built → `src/components/CommandPalette.tsx` |
| `Search.dc.html` | Search results | Built → `src/screens/SearchScreen.tsx` |
| `Projects.dc.html` | Projects | Built → `src/screens/ProjectsScreen.tsx` |
| `CreateProject.dc.html` | Create project | Built → `src/screens/CreateProjectScreen.tsx` |
| `Import.dc.html` | Import from Asana | Built → `src/screens/ImportScreen.tsx` |
| `ProjectMembers.dc.html` | Project settings · Members | Built → `src/screens/ProjectMembersScreen.tsx` |
| `ProjectStructure.dc.html` | Project settings · Sections, types, trash | Built → `src/screens/ProjectStructureScreen.tsx` |
| `GoogleChat.dc.html` | Project settings · Google Chat | Built → `src/screens/GoogleChatScreen.tsx` |
| `WorkflowEditor.dc.html` | Workflow editor | Built → `src/screens/WorkflowEditorScreen.tsx` |
| `AdminPeople.dc.html` | Admin · People & invitations | Built → `src/screens/AdminPeopleScreen.tsx` |
| `AdminDefaults.dc.html` | Admin · Roles, types, workflows | Built → `src/screens/AdminDefaultsScreen.tsx` |
| `ApiTokens.dc.html` | Profile · API tokens & MCP | Built → `src/screens/ApiTokensScreen.tsx` |
| `AdminBilling.dc.html` | Admin · Billing | Built → `src/screens/AdminBillingScreen.tsx` |
| `Reports.dc.html` | Admin · Reports | Built → `src/screens/WorkspaceReportsScreen.tsx` |
| `SignIn.dc.html` | Sign in | Built → `src/screens/auth/SignInScreen.tsx` |
| `AcceptInvite.dc.html` | Accept invitation | Built → `src/screens/auth/AcceptInviteScreen.tsx` |
| `WelcomeGuest.dc.html` | After accepting · Guest lands in their project | Built → `src/screens/auth/WelcomeGuestScreen.tsx` |
| `WelcomeMember.dc.html` | After accepting · Workspace-only member, empty My tasks | Built → `src/screens/auth/WelcomeMemberScreen.tsx` |
| `WrongAccount.dc.html` | Signed in with the wrong account | Built → `src/screens/auth/WrongAccountScreen.tsx` |
| `SheetPickers.dc.html` | Sheet · Inline pickers | To build |
| `SheetFilters.dc.html` | Sheet · Filters, saved views, blocked move | To build |
| `SheetModals.dc.html` | Sheet · Invite and confirmations | To build |
| `SheetTopBar.dc.html` | Sheet · Notifications, menus, bulk actions | To build |
| `SheetWorkflow.dc.html` | Sheet · Workflow editor dialogs | To build |
| `SheetStates.dc.html` | Sheet · Empty, loading, error states | To build |
| `SheetImport.dc.html` | Sheet · Import preview, progress, result | To build |
| `SheetTimesheets.dc.html` | Sheet · Timesheet variants and states | Built into `/timesheets` |
| `SheetEmails.dc.html` | Sheet · Emails | To build |
| `SheetMobile.dc.html` | Sheet · Phone width | Built → `src/components/AppShell.tsx`, `src/components/InstallPrompt.tsx` |
| `McpConsent.dc.html` | MCP · Allow Claude to connect | Built → `src/screens/auth/McpConsentScreen.tsx` |
| `McpConnected.dc.html` | MCP · Connected | Built → `src/screens/auth/McpConnectedScreen.tsx` |
| `GitHubSettings.dc.html` | Project settings · GitHub | Built → `src/screens/GitHubSettingsScreen.tsx` |
| `SheetGitHub.dc.html` | Sheet · GitHub on tasks, cards and branches | To build |
| `SheetGoogleChat.dc.html` | Sheet · Google Chat setup and messages | To build |
| `SheetApprovals.dc.html` | Sheet · Idea approval | To build |
| `SheetDragDrop.dc.html` | Sheet · Drag and drop | To build |
| `ProfileSettings.dc.html` | Profile and notifications | Built → `src/screens/ProfileSettingsScreen.tsx` |
| `WorkspaceGeneral.dc.html` | Admin · Workspace general (timesheets, working days, public holidays) | Built → `src/screens/WorkspaceGeneralScreen.tsx` |
| `CreateWorkspace.dc.html` | New client · Create a workspace | Built → `src/screens/auth/CreateWorkspaceScreen.tsx` |
| `SheetBillingStates.dc.html` | Sheet · Trial, payment and seat states | To build |
