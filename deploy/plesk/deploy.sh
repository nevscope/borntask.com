#!/usr/bin/env bash
# Pull, rebuild Compose (api + worker), publish the web SPA to app.borntask.com.
# Run on the Plesk host. Needs docker (root, or user in group docker).
# Does not bind kerd ports 3000 / 3307 / 6380.
set -euo pipefail

REPO=/var/www/vhosts/borntask.com/repo
ENV_FILE=/var/www/vhosts/borntask.com/docker/borntask/.env
INTEGRATIONS_FILE=/var/www/vhosts/borntask.com/repo/deploy/plesk/.env.integrations
DOCROOT=/var/www/vhosts/borntask.com/app.borntask.com
COMPOSE_DIR="$REPO/deploy/plesk"
compose_env=(--env-file "$ENV_FILE")
if [[ -f "$INTEGRATIONS_FILE" ]]; then
  compose_env+=(--env-file "$INTEGRATIONS_FILE")
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
    return
  fi
  if command -v sg >/dev/null && getent group docker >/dev/null; then
    local quoted
    quoted=$(printf '%q ' docker "$@")
    sg docker -c "$quoted"
    return
  fi
  echo "Cannot talk to Docker. Run deploy/plesk/install-agent-access.sh as root once." >&2
  exit 1
}

cd "$REPO"
if [[ -d .git ]]; then
  branch=$(git rev-parse --abbrev-ref HEAD)
  git fetch origin
  git merge --ff-only "origin/$branch"
fi

cd "$COMPOSE_DIR"
docker_cmd compose "${compose_env[@]}" --profile app up -d --build

docker_cmd compose "${compose_env[@]}" --profile app exec -T api \
  npx prisma db push --schema /app/prisma/schema.prisma --accept-data-loss=false

docker_cmd run --rm \
  -v "$REPO:/app" \
  -w /app \
  -e VITE_USE_MOCKS=false \
  -e VITE_MOCK_PROJECTS=false \
  -e VITE_MOCK_TASKS=false \
  -e VITE_API_URL=/api \
  -e VITE_MCP_URL=https://app.borntask.com/mcp \
  node:22-bookworm-slim \
  bash -lc 'apt-get update -qq && apt-get install -y -qq ca-certificates git python3 make g++ >/dev/null && npm ci && npm run build -w @borntask/web'

OWNER=$(stat -c '%U:%G' "$DOCROOT")
rsync -a --delete "$REPO/apps/web/dist/" "$DOCROOT/"
# Apache 403s empty directories (no Indexes). Copy the SPA so /create-workspace/ and /projects/ load.
for route in sign-in create-workspace projects; do
  install -d "$DOCROOT/$route"
  cp -f "$DOCROOT/index.html" "$DOCROOT/$route/index.html"
done
# Plesk serves custom 404 from error_docs for /p/:key/list. That page must track the current JS hash.
cp -f "$DOCROOT/index.html" /var/www/vhosts/borntask.com/error_docs/not_found.html
chown -R "$OWNER" "$DOCROOT" || true

echo "--- health ---"
curl -sS --max-time 10 http://127.0.0.1:3010/health
echo
curl -sS --max-time 10 -H 'Host: app.borntask.com' http://127.0.0.1/api/health || true
echo
curl -sS --max-time 10 https://app.borntask.com/api/health || true
echo
