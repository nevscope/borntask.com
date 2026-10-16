# Plesk deploy (BornTask)

Target: `app.borntask.com` on the existing Plesk + Docker host. **Do not deploy unless asked.**

Compose project name is `borntask`. Host bind ports (3308 / 6381 / 3010) are chosen so kerd can keep 3307 / 6380 / 3000.

## Agent deploy (after one-time root)

As root, once:

```bash
bash /var/www/vhosts/borntask.com/repo/deploy/plesk/install-agent-access.sh
```

After that, Cursor starts `deploy/plesk/deploy.sh` detached via Plesk domain exec on `borntask.com` (id 144) and reads `deploy/plesk/last-deploy.log`. A 30s panel timeout is normal. Optional: GitHub Action **Plesk deploy** with secret `PLESK_SSH_KEY`.

Manual:

```bash
bash /var/www/vhosts/borntask.com/repo/deploy/plesk/deploy.sh
```

Nginx extra directives: paste `app.borntask.com.nginx.conf` into Additional nginx directives. App profile (api + worker) is gated behind `--profile app`.
