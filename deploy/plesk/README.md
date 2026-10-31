# Plesk deploy (BornTask)

Target: `app.borntask.com` (SPA) and `borntask.com` / `httpdocs` (Astro marketing site) on the existing Plesk + Docker host. **Do not deploy unless asked.** The marketing build is `sites/www` and does not change the app image.

Compose project name is `borntask`. Host bind ports (3308 / 6381 / 3010) are chosen so kerd can keep 3307 / 6380 / 3000.

## Agent deploy (after one-time root)

As root, once:

```bash
bash /var/www/vhosts/borntask.com/repo/deploy/plesk/install-agent-access.sh
```

After that, Cursor starts `deploy/plesk/deploy.sh` detached via Plesk domain exec on `borntask.com` (id 144) and reads `deploy/plesk/last-deploy.log`. Use `post_domains_By_id_exec` with nested `{ id, command }` (not flattened). A 30s panel timeout is normal. Optional: GitHub Action **Plesk deploy** with secret `PLESK_SSH_KEY`.

Manual:

```bash
bash /var/www/vhosts/borntask.com/repo/deploy/plesk/deploy.sh
```

Nginx extra directives: paste `app.borntask.com.nginx.conf` into Additional nginx directives. App profile (api + worker) is gated behind `--profile app`.

## Workspace subdomains

The app treats `https://<slug>.borntask.com` as that workspace's sign-in and home. This is not created per workspace in DNS.

1. DNS: `A`/`AAAA` for `*.borntask.com` to the same host as `app.borntask.com`.
2. Plesk: wildcard alias or subdomain `*.borntask.com` serving the same SPA document root, same nginx `/api` proxy.
3. TLS: a wildcard certificate for `*.borntask.com`.
4. Env on the API: `APP_BASE_DOMAIN=borntask.com` and `SESSION_COOKIE_DOMAIN=.borntask.com`.

`app`, `www`, `mail`, `notify`, `mcp` and similar labels stay reserved and cannot be workspace slugs.
