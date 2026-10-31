# Decisions

One line per locked call. Spec overrides live in REQUIREMENT-CHANGES.md. Open items stay at the bottom.

| Date | Decision |
| --- | --- |
| 2026-10-11 | Multi-tenant from day one. Every business table except User carries `tenantId`. |
| 2026-10-11 | Sign-in with Google and Microsoft; people join by email invitation. |
| 2026-10-11 | Default Delivery workflow includes On hold and Rejected. Soft delete + Trash (30 days). |
| 2026-10-11 | Stack matches kerd: npm workspaces, Node 22, React 19, Vite 6.4.4 exact, Ant Design 6, Fastify 5, Prisma/MySQL, Redis/BullMQ. |
| 2026-10-13 | Product name BornTask; domains borntask.com and app.borntask.com; workspace subdomains `<slug>.borntask.com`. |
| 2026-10-13 | Repo folder stays `D:\dev\asana` for now. Packages `@borntask/*`; Compose project `borntask`. Local ports: MySQL 3308, Redis 6381, API 3010, web 5174 (avoid kerd). |
| 2026-10-13 | No ESLint, no Prettier. Gates: `tsc` + `design:lint`. |
| 2026-10-13 | REQUIREMENT-CHANGES.md wins over the Oct 11 build plan. Mocks in `apps/web` are the UI; do not regenerate the five screens. |
| 2026-10-13 | Ideas / Improvements / Features start in Idea and need Business approval. Bugs start in workspace setting (default Approved). |
| 2026-10-13 | Failed test: tester chooses Fail → WIP; comment required. |
| 2026-10-13 | List drag = order or section only. Board drag = status only + live workflow rules. |
| 2026-10-13 | Guests may hold Business and approve in MVP. |
| 2026-10-13 | Override: owner / admin / project lead; reason required; logged. |
| 2026-10-13 | Workflow editor: owner and admin only. Project leads cannot edit workflows. |
| 2026-10-13 | Workflow templates: Delivery and Simple. |
| 2026-10-13 | MCP: personal tokens (`bt_pat_`) and OAuth (read / read_write). Cannot delete, change settings or invite. Stage 10. |
| 2026-10-13 | Chat MVP: incoming webhooks. Two-way Chat app is v2. |
| 2026-10-13 | Billing designed (€1/member/month, guests free, trial, `is_internal`) but ships after v1.2. No Subscription/Invoice tables in Stage 1. |
| 2026-10-13 | Payment provider: Stripe (probable); implement only in billing stage. |
| 2026-10-13 | GitHub App ships in v1.2. No GitHub tables in Stage 1. |
| 2026-10-13 | Offline: MVP shows "offline, changes not saved". Full sync in v1.1. |
| 2026-10-13 | Live boards (SSE): v1.1. |
| 2026-10-13 | Attachments: Plesk disk / `BLOB_ROOT`; 25 MB per file. |
| 2026-10-13 | Email: Resend or equivalent; sender `notify@borntask.com`. |
| 2026-10-13 | Brand: `#178A5C`, DM Sans + Sora. Not kerd saffron. |
| 2026-10-13 | Task order: fractional-index strings in the database. |
| 2026-10-13 | Status changes only via `moveTask()`. Deletes only via `softDeleteTask()`. |
| 2026-10-13 | Activity `via`: `app`, `mcp`, `github`, `import`, `automation`. |
| 2026-10-13 | Local auth: `ALLOW_DEV_LOGIN` when Google/Microsoft client secrets are empty. Invite URLs log to the API console (no Resend yet). |
| 2026-10-13 | First deploy uses path-based workspace switcher, not `<slug>.borntask.com` routing. |
| 2026-10-31 | Workspace web addresses are live hosts: `<slug>.borntask.com` for login and the app. `app.borntask.com` stays the hub. Needs wildcard DNS and TLS. |

## Still open (not blocking dogfood schema)

- Exact email provider account and DNS.
- Whether to keep a stub billing settings route with no provider.
- Wildcard DNS / TLS for `*.borntask.com` on Plesk (app code is ready).
