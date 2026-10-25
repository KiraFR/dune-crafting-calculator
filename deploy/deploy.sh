#!/usr/bin/env bash
# Builds the site and publishes it on the server named in .env.production.
#
#   deploy/deploy.sh
#
# .env.production (not committed: copy .env.production.example) holds the Supabase settings the build
# needs and where to publish: DEPLOY_HOST (an SSH host, or an alias from ~/.ssh/config), DEPLOY_DIR (a
# directory on it) and DEPLOY_NETWORK (the Docker network of the reverse proxy that serves the site over
# HTTPS). A variable set in the environment wins over the file.
#
# Each run uploads a new release next to the old ones and switches the site/current link to it in one
# step; the three latest releases are kept.
set -euo pipefail

cd "$(dirname "$0")/.."

# KEY from the environment, else from .env.production (Windows line endings tolerated).
setting() {
  local value=${!1:-}
  if [ -z "$value" ] && [ -f .env.production ]; then
    value=$(grep -E "^$1=" .env.production | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)
  fi
  printf '%s' "$value"
}

missing=()
for key in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY DEPLOY_HOST DEPLOY_DIR DEPLOY_NETWORK; do
  [ -n "$(setting "$key")" ] || missing+=("$key")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing in .env.production: ${missing[*]} (see .env.production.example)." >&2
  echo "Nothing was deployed." >&2
  exit 1
fi

host=$(setting DEPLOY_HOST)
remote=$(setting DEPLOY_DIR)
network=$(setting DEPLOY_NETWORK)
release=$(date +%Y%m%d-%H%M%S)

npm run build

ssh "$host" "mkdir -p '$remote/site/releases/$release'"
tar -C dist -cf - . | ssh "$host" "tar -C '$remote/site/releases/$release' -xf -"
scp -q deploy/docker-compose.yml deploy/nginx.conf "$host:$remote/"
ssh "$host" "cd '$remote/site' \
  && ln -sfn 'releases/$release' current.next && mv -T current.next current \
  && ls -1d releases/* | sort | head -n -3 | xargs -r rm -rf \
  && cd '$remote' && DEPLOY_NETWORK='$network' docker compose up -d --quiet-pull"

echo "Deployed release $release to $host"
