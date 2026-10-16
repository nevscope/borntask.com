# BornTask: agent instructions

BornTask (borntask.com, app.borntask.com) is a multi-tenant task tracker. Stack: React 19, Vite 6.4.4, TypeScript, Ant Design 6, TanStack Query 5, Fastify 5, Prisma/MySQL, Redis/BullMQ. App UI lives in `apps/web`. Spec: `REQUIREMENT-CHANGES.md` wins over `Task Manager Build Plan.md`. Interaction contract: `apps/web/CURSOR.md`.

- **Design is governed.** Follow `.cursor/rules/borntask-*.mdc` and `design-system/BRAND.md`. Reuse `apps/web/src/components` before writing new UI. Do not rebuild the five mock screens from scratch.
- **Before you say a UI task is done:** run `npm run design:lint` and fix every error.
- **Never** invent colours or fonts. Tokens are `#178A5C`, DM Sans and Sora in `apps/web/src/theme/tokens.ts`.
- **Gates:** `npm run typecheck` and `npm run design:lint`. No ESLint, no Prettier.
- **Production:** `app.borntask.com` on Plesk. Deploy only when asked, via `.cursor/skills/plesk-deploy/SKILL.md` (domain exec of `deploy/plesk/deploy.sh`). Do not touch kerd ports.
- Status changes only via `moveTask()`. Deletes only via `softDeleteTask()`. Database access for business data goes through the tenant-scoped Prisma client.
