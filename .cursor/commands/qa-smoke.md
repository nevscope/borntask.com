# QA smoke (token-light)

Run a short pass. Do not tour every `.dc.html` screen. Do not start Stripe, XLSX, Chat DMs, or deploy.

## Gates (always)

```
npm test
npm run design:lint
```

Skip `typecheck` unless a gate fails or you edited types.

## API (if 3010 is up)

Dev-login `owner@borntask.com` / BornTask Owner. Then GET:

`/me` `/projects` `/projects/WEB` `/projects/WEB/tasks` `/me/tasks` `/tasks/WEB-1` `/search?q=checkout` `/people` `/workflows` `/me/notifications` `/me/profile`

Log any non-200. Do not create extra tasks or invites unless a bug needs a repro.

## UI (if 5174 is up)

Open only: `/` `/p/WEB/list` `/p/WEB/board` `/projects` `/settings/people`. One click each. Stop if a page is blank after load.

## What to fix vs log

- Small (copy, 404 path, missing column after a known migration): fix and note in `docs/QA-LOG.md`.
- Bigger (workflow, isolation, billing, import, OAuth, data loss): log only. Do not start a rebuild.

## Write-up

Append a dated section to `docs/QA-LOG.md`. Table: route, result, leftover. No new markdown files.
