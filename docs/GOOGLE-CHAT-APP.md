# Google Chat app (v2)

Space incoming webhooks stay as they are (`POST` to a Chat webhook URL from `apps/worker/src/chatPost.ts`). This app sits beside that path.

## What the app adds

- Slash: `/borntask bug WEB title here` creates a task in that project's first section. Bugs start from `Workspace.bugsStartIn`. Also `idea`, `improvement`, `feature`.
- Message action "Create BornTask task" creates an idea (or the only project you are on) and replies with the key and Open.
- Idea cards: Approve and Reject call `moveTask()` as the mapped Chat user (`via: app`). Reject prompts for a comment. Testing cannot be skipped.
- Personal events (assigned, @mention, and the other Profile prefs that are on) DM that person as the Chat app when the service account below is set. That personal job does not post into the project space webhook.
- The BornTask user is matched to the Google user by login email, the same address slash commands use (`users/{email}`).
- The worker looks up the DM with `spaces:findDirectMessage?name=users/{email}` as the app (`chat.bot`), then `messages.create`. If Chat returns 404, it tries `spaces:setup` (`singleUserBotDm`, membership `users/{email}`). Google's auth table lists setup as user authentication only, so that call can be rejected. A rejected DM is not treated as success.
- If the DM fails (app not allowlisted, the person has not messaged the app, email alias rejected, 403 or 404), the worker posts to that person's saved space webhook. If neither works, it stores `lastError` and the task write still succeeds.
- Profile shows "Direct messages come from the BornTask Chat app; a saved webhook is the fallback." only when the service account is set. The Chat column still turns on when `GOOGLE_CHAT_APP_*` client settings are set.

## Server env

Set on the API and the worker (same env file; both containers in `deploy/plesk/docker-compose.yml`). Never commit secrets.

- `GOOGLE_CHAT_APP_CLIENT_ID`
- `GOOGLE_CHAT_APP_CLIENT_SECRET`
- `GOOGLE_CHAT_APP_VERIFICATION_TOKEN`
- `GOOGLE_CHAT_APP_SERVICE_ACCOUNT_JSON` - one-line service account JSON from the same Cloud project as the Chat app. `private_key` keeps `\n` escapes. This is what lets the worker DM as `chat.bot`.
- Or, instead of the JSON: `GOOGLE_CHAT_APP_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_CHAT_APP_SERVICE_ACCOUNT_PRIVATE_KEY` (PEM, newlines as `\n`).

Without the service account, personal events are not sent as DMs. They use the saved webhook only. The code does not treat client id and secret as enough to DM.

HTTP endpoint: `{API_PUBLIC_URL}/chat/app` (production: `https://app.borntask.com/api/chat/app`). Google must send `Authorization: Bearer <verification token>`.

No `googleapis` client is used. The worker signs a service-account JWT (`scope` `https://www.googleapis.com/auth/chat.bot`, no user impersonation) and calls the Chat REST API with `fetch`. Inbound work that Chat can wait for runs in the request; other posts stay on the existing `chatPost` job.

## Ops (do not run from BornTask)

You cannot finish DMs without this.

1. Create a Google Cloud project.
2. Enable the Google Chat API.
3. Configure the Chat app listing (name BornTask, HTTP endpoint above, slash `/borntask`, message action "Create BornTask task").
4. Allow the app on the Google Workspace (admin allowlist).
5. Create a service account in that same Cloud project and put its JSON in `GOOGLE_CHAT_APP_SERVICE_ACCOUNT_JSON` on the API and the worker. Do not commit the JSON. The JWT is the app itself (`chat.bot`), not domain-wide delegation.
6. People may need to message the BornTask app once, or an admin may install the app for the whole Workspace, before `findDirectMessage` can see a DM. Google documents the email form `users/{email}` for user authentication; app authentication's documented id is a People or Directory user id. BornTask still sends the login email, because that is the slash mapping. If Chat rejects it, the personal webhook is the fallback.

This document is the checklist only. Do not treat the product UI as having completed those steps.
