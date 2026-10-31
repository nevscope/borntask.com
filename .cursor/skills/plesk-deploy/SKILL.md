---
name: plesk-deploy
description: Deploy BornTask to Plesk app.borntask.com. Use when the user asks to deploy, ship, or release to production. Never run unless they gave an explicit go-ahead.
---

# Plesk deploy

Target: `https://app.borntask.com` (SPA) and `https://borntask.com` (Astro static from `sites/www` into `httpdocs`). Compose project `borntask`. Host binds **127.0.0.1:3308** (MySQL), **6381** (Redis), **3010** (API). Do not touch kerd ports **3000 / 3307 / 6380**. DNS/TLS is `app.borntask.com` plus the apex site; not `*.borntask.com`. Secrets stay in `/var/www/vhosts/borntask.com/docker/borntask/.env`, never git.

The panel client times out at about 30s. The deploy keeps running. That timeout is not a failure.

## How to run (preferred)

Plesk REST domain exec as the subscription user. Domain id **144** (`borntask.com`). Shell is `/bin/bash`. Check `post_domains_By_id_exec` usage before the first call in a session.

Call `si_plesk_api_method_execute_write` with **nested** `arguments`. Flattening `id` / `command` next to `methodName` fails with `Missing required argument 'id'`.

```
methodName: post_domains_By_id_exec
arguments: {
  id: 144,
  command: ["bash", "-lc", "..."]
}
```

1. Confirm the user asked to deploy.
2. If `deploy/plesk/deploy.sh` is already in `ps`, do not start another. Poll the log in step 4.
3. Start it detached. Git stores the script as mode 644, so `bash -lc /path/deploy.sh` returns permission denied (exit 126). Always invoke it with `bash`:

```
methodName: post_domains_By_id_exec
arguments: {
  id: 144,
  command: ["bash", "-lc", "setsid nohup bash /var/www/vhosts/borntask.com/repo/deploy/plesk/deploy.sh > /var/www/vhosts/borntask.com/repo/deploy/plesk/last-deploy.log 2>&1 < /dev/null & echo STARTED"]
}
```

4. Poll `deploy/plesk/last-deploy.log`. Sleep about 45s, then `tail` the last 50 lines. Image builds often take several minutes. Stop when a line `DEPLOY_EXIT:` appears.
   - `DEPLOY_EXIT:0` is success. The script prints `--- health ---` just before that.
   - `Cannot talk to Docker`: stop. They run this once as root: `bash /var/www/vhosts/borntask.com/repo/deploy/plesk/install-agent-access.sh`
   - Compose already finished and only the web step failed: do not rebuild images. Build `@borntask/shared`, then `@borntask/web`, then rsync `apps/web/dist/` the way `deploy.sh` does. A missing `@borntask/shared` module means shared was not built first.
5. After `DEPLOY_EXIT:0`, curl `https://app.borntask.com/api/health` and open `/sign-in`. The first screenshot is often blank. Read the page text and wait until **Sign in** is there. Also open `https://borntask.com/` and confirm the inverted mark and **Open BornTask**. Do not claim done without those checks.

`npm ci` runs only when `package-lock.json` differs from `node_modules/.package-lock.stamp`. The web image `borntask-web-builder:node22` caches apt.

## Fallback

If domain exec cannot use Docker, dispatch GitHub Actions workflow `Plesk deploy` (`plesk-deploy.yml`) with `gh workflow run "Plesk deploy"` after `PLESK_SSH_KEY` is set on the repo.

## Do not

- Bind or restart kerd Compose.
- Commit `.env`.
- Issue a wildcard certificate or `*.borntask.com` DNS unless the user asked to turn on workspace hosts (`<slug>.borntask.com`).
- Deploy from this skill without an explicit user go-ahead.
- Start a second deploy while one is running.
- Treat the 30s panel timeout as a failed deploy.
