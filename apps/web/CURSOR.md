# BornTask web: brief for Cursor

This folder is the **drop-in `apps/web`** for the BornTask monorepo. It follows the kerd.ai scaffold, so keep the layout. The mocks are the product UI: replace the data source, not the screens.

## Ground rules

- **Package:** `@borntask/web`. The root package is `borntask`, and future siblings are `@borntask/shared`, `@borntask/api`, `@borntask/worker` and `@borntask/mcp`.
- **Pins (kerd, not "latest"):** Node ≥22, TypeScript ^5.9.0, Vite **6.4.4** exact, React ^19.3.0, antd ^6.6.5, @tanstack/react-query ^5.104.0, react-router-dom ^7.18.4, dayjs ^1.11.23, zod ^3.25.76. Mock-stage additions: @dnd-kit/core. Tiptap is approved but **not yet added**; the description field is a plain TextArea.
- **No ESLint, no Prettier.** The gates are `npm run typecheck` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) and **`design:lint`**, which is ported from kerd. Add it as a root script and run it against `apps/web/src`.
- **No emoji in the UI.** Use the SVG icons in `components/Chips.tsx` (for example `LockIcon`).
- **Colours, fonts and radii** come from `src/theme/tokens.ts` and `antdTheme.ts`. Do not hard-code new hex values. The ones still inline in the screens should move to tokens when `design:lint` lands.

## Structure

```
src/
  main.tsx            QueryClient, ConfigProvider(antdTheme, en_GB), AntD App, BrowserRouter, QuickAddProvider
  App.tsx             routes + ?screen= demo nav (remove when auth lands)
  api/
    types.ts          Zod schemas + `interface Api` with the proposed REST routes, one comment per method
    http.ts           fetch client: credentials: 'include', Zod-validates every response, throws ApiError
    mockData.ts       fictional workspace and mockApi (same Api interface, enforces workflow rules)
    queries.ts        USE_MOCKS switch, query keys (qk), read hooks, mutation hooks with optimistic updates
  lib/
    workflow.ts       checkMove / moveOptions / canOverride / initialStatusFor — shared by UI and mock
    dates.ts          due labels, tones, My-tasks buckets
    quickParse.ts     "@karl fri !high" parser for Quick add
  components/         AppShell, ProjectHeader, TaskDrawer, QuickAdd, useMoveFlow, useTaskParam, Chips, Logo
  screens/            MyTasksScreen, ProjectListScreen, ProjectBoardScreen
  theme/              tokens.ts, antdTheme.ts, global.css
docs/design/          43 canvas screens (visual spec) + INDEX.md showing built vs to-build
```

## Switching to the real API

1. Build `@borntask/api` (Fastify 5 + Prisma/MySQL) to the routes commented in `api/types.ts → interface Api`.
2. Move `api/types.ts` into `packages/shared` as `@borntask/shared`, so the API validates requests with the same Zod schemas the web app uses to validate responses.
3. Set `VITE_USE_MOCKS=false` in production; the hooks and screens stay unchanged.
4. Error contract: `{ error: { code, message, allowedRoles? } }`. `TRANSITION_NOT_ALLOWED` (403) must include `allowedRoles` so the UI can show "Ask Developer".

## Rules the server must enforce (the mock already does)

| Rule | Detail |
|---|---|
| Start status | Bugs start in **Approved** (a workspace setting; default on). Ideas, Improvements and Features start in **Idea** and need Business approval. |
| Transitions | Use the per-workflow list `{from, to, roles[], requireComment, label}`. An empty `roles` list means any project member. |
| On hold | `* → on_hold` is allowed from any non-done status. Leaving On hold returns to `previousStatusId`. |
| Comments | Reject (Idea → Rejected) and Fail (Testing → WIP) require a comment. Send it in the move body, not as a separate call. |
| Override | Workspace owner/admin or project Lead may make a disallowed move **with** `overrideReason`. Log it in activity as an override. |
| WIP limits | Soft limits: the column count turns red; moves are never blocked. |
| Delete | Soft delete. `DELETE /tasks/:key` then `POST /tasks/:key/restore` within 30 days. The UI shows Undo. |
| Ordering | The mock uses float midpoints. **Use fractional-index strings** (e.g. `fractional-indexing`) in the DB; `reorder` takes `{sectionId, beforeKey}` so the client never computes positions. |
| Activity `via` | `app`, `mcp`, `github`, `import`. Show it in the feed ("via Claude (MCP)"). |

## Phone, PWA and offline (MVP)

- **Phone chrome** (under 768px): bottom tab bar (Tasks, Projects, Inbox, You), full-screen task sheet, and a FAB for Quick add. Desktop sidebar and the 600px task drawer stay at 768px and above.
- **PWA:** `public/manifest.webmanifest`, icons, and a shell service worker (`public/sw.js`) registered in production only. The SW caches the app shell and `/assets/`. `/api/` and cookie/session fetches are network-only so offline never serves stale workspace JSON.
- **Install:** in-app sheet on a supported browser (`beforeinstallprompt`) or iOS share-to-home-screen copy. Chrome install on a real phone often needs HTTPS; `vite preview` on localhost may not show the native prompt.
- **Offline:** an Offline banner when `navigator.onLine` is false. Reads of a cached shell may still work. Writes are not queued - they fail until the device reconnects. Do not pretend a save succeeded.

## Interaction contract (keep it)

- **List drag** changes order or section only, never status.
- **Board drag** changes status only. While dragging, allowed columns are tinted green, blocked ones fade, and their "Developer only" reason is shown. Dropping on a blocked column opens a notification with *Ask <role>* (posts an @mention comment) and *Override…* (asks for a reason, owner/admin/lead only).
- **Task drawer** is driven by `?task=KEY` on any route. It autosaves on blur/change and shows "Saving… / ✓ Saved" from `useIsMutating`.
- **Quick add:** press `Q` anywhere outside inputs. The title parses `@person`, `!urgent|high|medium|low` and `today/tomorrow/mon…sun/next week`. The description starts empty. Screenshots can be pasted or dropped. Chosen files upload to `POST /uploads` before create, and the task is created with those attachment ids. Enter creates; Shift+Enter creates and opens. The drawer adds, downloads and removes files on the task. Files over 25 MB are rejected.

## Next to build (from docs/design, in suggested order)

1. Auth: SignIn, WrongAccount, AcceptInvite, Welcome (Google + Microsoft OIDC; email invites).
2. Projects index, CreateProject, ProjectMembers (invite "+" in the project header), ProjectStructure (sections).
3. Search page and CommandPalette (Ctrl/Cmd K); the top-bar search input is already placed.
4. Admin: People, Defaults, WorkflowEditor, Billing (€1 per member per month; guests free), Import (Asana .xlsx).
5. Integrations: GitHub App, Google Chat app, MCP consent/connected, API tokens.

## Known gaps in this handoff

- The search input and the invite "+" button are placeholders.
- No auth guard yet. `getMe` failing with 401 should redirect to `/sign-in`.
- The bundle is about 1.1 MB, one chunk. Lazy-load routes with `React.lazy` when the admin screens arrive.
