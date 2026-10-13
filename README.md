# BornTask

Multi-tenant work tracker (borntask.com, app.borntask.com). Stack matches kerd: React 19, Vite 6.4.4, Ant Design 6, Fastify 5, Prisma/MySQL, Redis/BullMQ.

Spec: [REQUIREMENT-CHANGES.md](REQUIREMENT-CHANGES.md) wins over [Task Manager Build Plan.md](Task%20Manager%20Build%20Plan.md). Product docs: [docs/PRD.md](docs/PRD.md). UI mocks live in `apps/web` (see `apps/web/CURSOR.md`). Design specs: `apps/web/docs/design/`.

## Layout

```text
apps/web/        React 19 + Vite 6.4.4 + Ant Design 6 (nested mocks)
apps/api/        Fastify HTTP API (`GET /health`)
apps/worker/     BullMQ stubs (import, notify, purge)
apps/mcp/        MCP stub (`GET /health`, `/mcp` → 501)
packages/shared/ Zod + queue names
prisma/          MySQL schema + seed
```

Local ports (do not clash with kerd): MySQL **3308**, Redis **6381**, API **3010**, web **5174**, MCP **3011**.

## Quick start

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
npm install
npm run compose:up
npm run db:generate
npm run db:push
npm run db:seed
```

Then in separate terminals:

```bash
npm run dev:web    # http://localhost:5174  (VITE_USE_MOCKS=true)
npm run dev:api    # http://localhost:3010/health
npm run dev:worker
```

Gates: `npm run typecheck` and `npm run design:lint`. Isolation: `npm run test:isolation` (needs seed).

The checkout lives at `D:\dev\asana`. Product and npm packages stay `@borntask/*`.
