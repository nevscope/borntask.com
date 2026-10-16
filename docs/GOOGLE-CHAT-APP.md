# Google Chat app (v2)

Space incoming webhooks stay as they are (`POST` to a Chat webhook URL from `apps/worker/src/chatPost.ts`). This app sits beside that path.

## What the app adds

- Slash: `/borntask bug WEB title here` creates a task in that project's first section. Bugs start from `Workspace.bugsStartIn`. Also `idea`, `improvement`, `feature`.
- Message action "Create BornTask task" creates an idea (or the only project you are on) and replies with the key and Open.
- Idea cards: Approve and Reject call `moveTask()` as the mapped Chat user (`via: app`). Reject prompts for a comment. Testing cannot be skipped.
- Profile Google Chat checkboxes turn on when `GOOGLE_CHAT_APP_*` is set, not only when a personal webhook exists. Assigned and @mention still fall back to the personal webhook if the app cannot DM.

## Server env

Set on the API (and worker) host. Never commit secrets.

- `GOOGLE_CHAT_APP_CLIENT_ID`
- `GOOGLE_CHAT_APP_CLIENT_SECRET`
- `GOOGLE_CHAT_APP_VERIFICATION_TOKEN`

HTTP endpoint: `{API_PUBLIC_URL}/chat/app` (production: `https://app.borntask.com/api/chat/app`). Google must send `Authorization: Bearer <verification token>`.

No `googleapis` client is used. Inbound work that Chat can wait for runs in the request; other posts stay on the existing notify queue.

## Ops (do not run from BornTask)

You cannot finish DMs without this.

1. Create a Google Cloud project.
2. Enable the Google Chat API.
3. Configure the Chat app listing (name BornTask, HTTP endpoint above, slash `/borntask`, message action "Create BornTask task").
4. Allow the app on the Google Workspace (admin allowlist).
5. DMs need Chat API write as the app (typically a service account with `chat.bot`). Until that exists, BornTask posts to the user's saved space webhook.

This document is the checklist only. Do not treat the product UI as having completed those steps.
