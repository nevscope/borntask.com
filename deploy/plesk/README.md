# Plesk deploy (BornTask)

Target: `app.borntask.com` on the existing Plesk + Docker host. **Do not deploy unless asked.**

Compose project name is `borntask`. Host bind ports (3308 / 6381 / 3010) are chosen so kerd can keep 3307 / 6380 / 3000.

```bash
cd /var/www/vhosts/borntask.com/repo/deploy/plesk
docker compose --env-file /var/www/vhosts/borntask.com/docker/borntask/.env up -d
```

App profile (api + worker) is gated behind `--profile app`.
