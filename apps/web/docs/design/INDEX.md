# Design references

Static markup exported from the BornTask design canvas. They are the visual spec, not code to copy:
build each screen with Ant Design components and `src/theme/tokens.ts`, matching spacing, copy and states.
Files use a canvas wrapper (`<x-dc>`, `support.js`), so read them as markup; they will not open cleanly on their own.

| File | Screen | Status in `apps/web` |
|---|---|---|
| `Main.dc.html` | My tasks | Built → `src/screens/MyTasksScreen.tsx` |
| `ListView.dc.html` | Project · List view | Built → `src/screens/ProjectListScreen.tsx` |
| `BoardView.dc.html` | Project · Board view | Built → `src/screens/ProjectBoardScreen.tsx` |
| `TaskDetail.dc.html` | Task detail drawer | Built → `src/components/TaskDrawer.tsx` |
| `QuickAdd.dc.html` | Quick add (Q) | Built → `src/components/QuickAdd.tsx` |
| `CommandPalette.dc.html` | Command palette (Ctrl/Cmd K) | To build |
| `Search.dc.html` | Search results | To build |
| `Projects.dc.html` | Projects | Built → `src/screens/ProjectsScreen.tsx` |
| `CreateProject.dc.html` | Create project | Built → `src/screens/CreateProjectScreen.tsx` |
| `Import.dc.html` | Import from Asana | Built → `src/screens/ImportScreen.tsx` |
| `ProjectMembers.dc.html` | Project settings · Members | Built → `src/screens/ProjectMembersScreen.tsx` |
| `ProjectStructure.dc.html` | Project settings · Sections, types, trash | Built → `src/screens/ProjectStructureScreen.tsx` |
| `GoogleChat.dc.html` | Project settings · Google Chat | To build |
| `WorkflowEditor.dc.html` | Workflow editor | To build |
| `AdminPeople.dc.html` | Admin · People & invitations | Built → `src/screens/AdminPeopleScreen.tsx` |
| `AdminDefaults.dc.html` | Admin · Roles, types, workflows | Built → `src/screens/AdminDefaultsScreen.tsx` |
| `ApiTokens.dc.html` | Profile · API tokens & MCP | To build |
| `AdminBilling.dc.html` | Admin · Billing | To build |
| `SignIn.dc.html` | Sign in | To build |
| `AcceptInvite.dc.html` | Accept invitation | To build |
| `WelcomeGuest.dc.html` | After accepting · Guest lands in their project | To build |
| `WelcomeMember.dc.html` | After accepting · Workspace-only member, empty My tasks | To build |
| `WrongAccount.dc.html` | Signed in with the wrong account | To build |
| `SheetPickers.dc.html` | Sheet · Inline pickers | To build |
| `SheetFilters.dc.html` | Sheet · Filters, saved views, blocked move | To build |
| `SheetModals.dc.html` | Sheet · Invite and confirmations | To build |
| `SheetTopBar.dc.html` | Sheet · Notifications, menus, bulk actions | To build |
| `SheetWorkflow.dc.html` | Sheet · Workflow editor dialogs | To build |
| `SheetStates.dc.html` | Sheet · Empty, loading, error states | To build |
| `SheetImport.dc.html` | Sheet · Import preview, progress, result | To build |
| `SheetEmails.dc.html` | Sheet · Emails | To build |
| `SheetMobile.dc.html` | Sheet · Phone width | To build |
| `McpConsent.dc.html` | MCP · Allow Claude to connect | To build |
| `McpConnected.dc.html` | MCP · Connected | To build |
| `GitHubSettings.dc.html` | Project settings · GitHub | To build |
| `SheetGitHub.dc.html` | Sheet · GitHub on tasks, cards and branches | To build |
| `SheetGoogleChat.dc.html` | Sheet · Google Chat setup and messages | To build |
| `SheetApprovals.dc.html` | Sheet · Idea approval | To build |
| `SheetDragDrop.dc.html` | Sheet · Drag and drop | To build |
| `ProfileSettings.dc.html` | Profile and notifications | To build |
| `WorkspaceGeneral.dc.html` | Admin · Workspace general | Built → `src/screens/WorkspaceGeneralScreen.tsx` |
| `CreateWorkspace.dc.html` | New client · Create a workspace | To build |
| `SheetBillingStates.dc.html` | Sheet · Trial, payment and seat states | To build |
