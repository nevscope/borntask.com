---
name: plesk-deploy
description: Deploy BornTask to Plesk app.borntask.com. Use when the user asks to deploy, ship, or release to production. Never run unless they gave an explicit go-ahead.
---

# Plesk deploy

Target: `https://app.borntask.com`. Compose project `borntask`. Host binds **127.0.0.1:3308** (MySQL), **6381** (Redis), **3010** (API). Do not touch kerd ports **3000 / 3307 / 6380**. DNS/TLS is `app.borntask.com` only, not `*.borntask.com`. Secrets stay in `/var/www/vhosts/borntask.com/docker/borntask/.env`, never git.

## How to run (preferred)

Plesk REST domain exec as the subscription user. Domain id **144** (`borntask.com`). Shell is `/bin/bash`.

1. Confirm the user asked to deploy.
2. `si_plesk_api_method_execute` → `post_domains_by_id_exec` with:

```
id: 144
command: ["bash", "-lc", "/var/www/vhosts/borntask.com/repo/deploy/plesk/deploy.sh"]
```

3. If stdout says Docker permission denied, they have not run `install-agent-access.sh` as root. Stop and give that one command.
4. After a clean script, curl `https://app.borntask.com/api/health` and open `/sign-in`. Report those results. Do not claim done without them.

## Fallback

If domain exec cannot use Docker, dispatch GitHub Actions workflow `Plesk deploy` (`plesk-deploy.yml`) with `gh workflow run "Plesk deploy"` after `PLESK_SSH_KEY` is set on the repo.

## Do not

- Bind or restart kerd Compose.
- Commit `.env`.
- Issue a wildcard certificate or `*.borntask.com` DNS.
- Deploy from this skill without an explicit user go-ahead.
