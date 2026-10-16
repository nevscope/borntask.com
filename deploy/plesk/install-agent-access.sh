#!/usr/bin/env bash
# One-time root setup so Cursor can deploy via Plesk domain exec (no interactive root).
# Adds the subscription user to group docker and lets it read the host .env and repo.
set -euo pipefail
if [[ $(id -u) -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

USER_NAME=borntask.com_5eh2zubnrge
REPO=/var/www/vhosts/borntask.com/repo
ENV_FILE=/var/www/vhosts/borntask.com/docker/borntask/.env

id "$USER_NAME" >/dev/null
getent group docker >/dev/null
usermod -aG docker "$USER_NAME"

chown -R "$USER_NAME":psacln "$REPO"
find "$REPO" -type d -exec chmod 775 {} \;
find "$REPO" -type f -exec chmod 664 {} \;
chmod +x "$REPO/deploy/plesk/deploy.sh" "$REPO/deploy/plesk/install-agent-access.sh"

if [[ -f "$ENV_FILE" ]]; then
  chown root:psacln "$ENV_FILE"
  chmod 640 "$ENV_FILE"
fi

echo "Done. New group membership applies on the next Plesk exec."
echo "Test: docker ps as $USER_NAME via sg docker -c 'docker ps'"
