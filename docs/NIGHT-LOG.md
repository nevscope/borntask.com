# Night log - 13 Oct 2026

Night runner: Stages 2-7 landed. Follow-up: `tsc` for `@borntask/api` and `@borntask/web` is clean (session `key`, explicit `tenantId` on creates, typed web `api`). `design:lint` was already clean of errors.

Hard stops honoured: no Stripe, no GitHub App, no Plesk, no production OAuth apps, no Chat/MCP/billing.

## What shipped

### Stage 2 - Auth and workspaces
- Fastify secure session cookie, CORS credentials, Vite `/api` proxy to port 3010.
- Google and Microsoft OIDC **if** client id/secret are set. Otherwise `ALLOW_DEV_LOGIN=true` (default in `.env`).
- Routes: `/sign-in`, `/invite/:token`, `/invite/:token/wrong-account`, `/welcome/member`, `/welcome/guest`, `/create-workspace`.
- Workspace switcher in the sidebar (session `tenantId`). Create-workspace 3-step flow (name, `<slug>.borntask.com`, Delivery/Simple, optional domain, invites, first project).
- Invites: 7-day hashed token. **Invite URLs print to the API console** (`[BornTask] Invite for …`).
- Wrong-account creates an `InviteRequest` and logs it.
- Real React Router. The five mock screens stay on their old paths. `?screen=` demo jumps still work.

### Stage 3 - Mock screens
- My tasks, list, board, drawer (`?task=`), Quick add (`Q`) are **not rebuilt**.
- With `VITE_USE_MOCKS=true` (default), `getMe` falls back to the mock user if the API is down or you are signed out, so the five screens still load.

### Stage 4 - Projects / members / sections API
- `GET/POST /projects`, `GET /projects/:key`, sections, project members, `GET /people`.
- Invite `+` on the project header is wired (`POST /invites`).
- Flip later with `VITE_MOCK_PROJECTS=false` (keep `VITE_USE_MOCKS=true` for tasks if you want).

### Stage 5 - Tasks
- Real create/update/move/reorder/comment/subtask, soft delete + restore, Trash route `/p/:key/trash`, Watch, upload to `BLOB_ROOT` (25 MB).
- Start status: bugs follow `bugsStartIn`; ideas/improvements/features start in Idea.
- Flip with `VITE_MOCK_TASKS=false`.

### Stage 6 - moveTask + workflow editor
- Server `moveTask()` enforces roles, required comments, On hold return, override (owner/admin/lead + reason), activity log `via: app`.
- `/settings/workflow` - owner/admin can save transitions. Others see a warning.

### Stage 7 - List/board, My tasks, search, palette
- Existing list drag (order/section) and board drag (status + Ask/Override) unchanged.
- My tasks tabs: Assigned / Created / Watching (mock fills Created; Watching is empty unless you use the real API).
- `/search` (mock filters in-memory; live uses `GET /search`).
- Command palette: Ctrl/Cmd K.

Not this night: Stripe, GitHub, Chat, MCP tools, Resend, production OAuth apps, Plesk.

## How to run

```bat
cd /d D:\dev\asana
npm run compose:up
npm run db:generate
npm run db:push
npm run db:seed
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5174
- API: http://localhost:3010/health
- Seed owners: `owner@borntask.com` (workspace **BornTask** / `internal`) and `owner@acme.test` (**Acme**).

`.env` already has `ALLOW_DEV_LOGIN=true`. OAuth keys are empty.

`apps/web/.env` keeps:

```
VITE_USE_MOCKS=true
VITE_MOCK_PROJECTS=true
VITE_MOCK_TASKS=true
```

To dogfood the real API after sign-in, set `VITE_MOCK_PROJECTS=false` and `VITE_MOCK_TASKS=false` and restart Vite.

## What to click in the morning

1. http://localhost:5174/?screen=my-tasks then `list`, `board`, `task`, `quick-add` - confirm the five mocks still work.
2. http://localhost:5174/sign-in - Developer sign-in as `owner@borntask.com` / any name. You should land on My tasks with workspace **BornTask**.
3. Sidebar workspace control - Create workspace (skip OAuth). Check API logs if you invite someone.
4. Project header **+** - invite `guest@example.com`. Copy the `[BornTask] Invite` URL from the API terminal, open it, sign in as that email, expect Welcome guest or Wrong account if the emails differ.
5. Avatar menu - Workflow editor (owner). Ctrl+K palette. Search box. Project **Trash** tab.
6. Optional: `npm run typecheck` (api + web were green after the tenantId/session/api typing fix). `design:lint` had warnings only.

## Known gaps

- Typecheck evidence missing (hung). Fix that first if CI or local tsc is clean on your machine.
- `finishLogin` from developer sign-in uses a server redirect; the sign-in form then navigates home.
- Upload without a `taskId` stores a blob only (no Attachment row) because the schema requires a task.
- Reorder rewrites section positions as `a0000` strings (not a full fractional-indexing library).
- Status ids on the wire are **slugs** (`idea`, `on_hold`) so the existing UI workflow helpers keep working.
- No email delivery. No production Google/Microsoft apps.

---

# Morning follow-up - 14 Oct 2026

Closed the skipped project/admin screens plus Stage 8 CSV import. My tasks, List, Board, drawer and Quick add were not rebuilt.

## What shipped this morning

- Projects index (`/projects`) with Active / Archived and Import entry.
- Create project (`/projects/new`): name, key, Delivery/Simple, sections, members.
- Project settings: Members (roles, pending invites, resend/revoke) and Sections/types/trash.
- Admin: People and invitations, Defaults, Workspace general (owner/admin save).
- Live API for those screens. Sidebar banner explains `VITE_MOCK_PROJECTS` / `VITE_MOCK_TASKS`. Task and project hooks fall back to mocks if the API is down.
- Stage 8: CSV upload, column mapping, preview 20 rows, unknown emails invited as Member, BullMQ `asana-import` job, idempotent on Asana Task ID. XLSX is rejected with a save-as-CSV message.

## How to run live screens

Also start `npm run dev:worker`. In `apps/web/.env` set `VITE_MOCK_PROJECTS=false` and `VITE_MOCK_TASKS=false`, restart Vite, sign in as `owner@borntask.com`.

## What to click

1. Sidebar **Projects** then New project or Import from Asana.
2. Project tabs **Members** and **Sections**.
3. Avatar menu: People, Defaults, Workspace general.

## Checks

- Web and worker `tsc --noEmit --incremental false`: clean.
- API `tsc`: clean after import mapping fix.
- `npm run design:lint`: 0 errors.

## Still later

XLSX parsing, digest, Tiptap, saved views, Resend, notification prefs, billing, section drag-reorder, per-project type toggles, delete workspace.
