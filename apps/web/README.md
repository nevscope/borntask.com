# @borntask/web

BornTask's web app (React 19 + Vite 6.4.4 + Ant Design 6 + TanStack Query 5). Five core screens ship with fictional mock data, so you can click through the real UI before the API exists.

## Run

```bash
npm install
npm run dev          # http://localhost:5174
npm run typecheck    # tsc gate
npm run build        # typecheck + vite build
```

Node ≥ 22. `.env` sets `VITE_USE_MOCKS=true`. Set it to `false` and point `VITE_API_URL` at the Fastify API to run against real data.

## Demo links

| URL | Screen |
|---|---|
| `/?screen=my-tasks` | My tasks (approvals and due buckets) |
| `/?screen=list` | Website relaunch · List (drag ⋮⋮ to reorder or move section) |
| `/?screen=board` | Website relaunch · Board (drag to change status) |
| `/?screen=task` | Task drawer for WEB-142 (`?task=KEY` works on any page) |
| `/?screen=quick-add` | Quick add modal (or press **Q** anywhere) |

You are signed in as **Scope**, a workspace owner with the Business and Tester roles. That means you can approve ideas and pass or fail tests. Dragging an Approved card to WIP is blocked because only Developers make that move, which demonstrates the "Ask / Override" flow.

Mock changes live in memory and reset on reload.

For the build brief, see [CURSOR.md](./CURSOR.md). The visual spec for every screen is in [docs/design](./docs/design/INDEX.md).
