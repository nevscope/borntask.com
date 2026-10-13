# Screens

Visual specs: **`apps/web/docs/design/`** (INDEX.md lists built vs to-build). Do not regenerate the five built screens. API and interaction contract: `apps/web/CURSOR.md`.

## Built (nested mocks)

| Screen | File | Notes |
| --- | --- | --- |
| My tasks | `src/screens/MyTasksScreen.tsx` | Assigned / Created / Watching; approvals group in spec |
| Project list | `src/screens/ProjectListScreen.tsx` | List drag = order/section only |
| Project board | `src/screens/ProjectBoardScreen.tsx` | Board drag = status only |
| Task drawer | `src/components/TaskDrawer.tsx` | Autosave; `?task=WEB-142` |
| Quick add | `src/components/QuickAdd.tsx` | Shortcut Q |

## Auth and workspace (Stage 2)

Sign in (Google / Microsoft). Accept invitation (7-day token). Wrong account. Welcome member. Welcome guest. Create workspace (name, `<slug>.borntask.com`, workflow template, domain auto-join, invite, first project). App shell: workspace switcher, Favourites, search, notifications, avatar, command palette.

## Projects and people (Stage 4)

Projects index (Active / Archived, Import from Asana). Create project (key, colour, workflow, initial sections, members). Project members and invite `+`. Project structure (sections, types, trash). No-access + request access.

## Admin and settings

People and invitations. Defaults (roles, types, workflows). Workflow editor (owner/admin). Workspace general (logo, timezone, week start, bugs start in, members can invite guests). Profile and notification preferences. API tokens (`bt_pat_`). MCP consent and connected apps (Stage 10). Google Chat webhooks (Stage 10). GitHub settings (v1.2). Billing (after v1.2).

## Import and search

Search results. Command palette. Asana import mapping/preview. Email sheets (digest from `notify@borntask.com`).

## Global patterns

Filter bar. Keyboard: Alt ↑/↓ reorder, S status, M section, `?` shortcuts. Loading skeleton after 300 ms. Offline banner in MVP. Phone width under 768 px (bottom bar, swipeable board columns).
