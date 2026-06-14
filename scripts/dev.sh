#!/usr/bin/env bash
# Run Node tooling inside a container via podman — no Node install on the host.
#
#   scripts/dev.sh install            # npm ci / install
#   scripts/dev.sh dev                # next dev on http://0.0.0.0:3000 (LAN)
#   scripts/dev.sh build              # next build
#   scripts/dev.sh prisma <args...>   # e.g. prisma migrate dev --name init
#   scripts/dev.sh npm <args...>      # arbitrary npm command
#   scripts/dev.sh exec <cmd...>      # arbitrary command in the container
#   scripts/dev.sh shell              # interactive shell
set -euo pipefail

IMAGE="docker.io/library/node:22-slim"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Persist npm cache between runs for faster installs.
CACHE_VOL="finance-tracker-npm-cache"

run() {
  # Note: we deliberately do NOT use --env-file. podman doesn't strip quotes
  # from env-file values, which would corrupt a quoted DATABASE_URL. Next.js
  # and Prisma both auto-load .env from the mounted project dir instead.
  podman run --rm -it \
    -v "$PROJECT_DIR":/app:Z \
    -v "$CACHE_VOL":/root/.npm \
    -w /app \
    "$@"
}

cmd="${1:-}"; shift || true

case "$cmd" in
  install)
    run "$IMAGE" sh -c 'apt-get update -y >/dev/null && apt-get install -y openssl >/dev/null && npm install'
    ;;
  dev)
    # Publish 3000 and bind Next to 0.0.0.0 so it is reachable on the LAN.
    run -p 3000:3000 "$IMAGE" sh -c 'npm run dev -- -H 0.0.0.0 -p 3000'
    ;;
  build)
    run "$IMAGE" sh -c 'apt-get update -y >/dev/null && apt-get install -y openssl >/dev/null && npx prisma generate && npm run build'
    ;;
  prisma)
    run "$IMAGE" sh -c 'apt-get update -y >/dev/null && apt-get install -y openssl >/dev/null && npx prisma "$@"' _ "$@"
    ;;
  npm)
    run "$IMAGE" npm "$@"
    ;;
  exec)
    run "$IMAGE" "$@"
    ;;
  shell)
    run "$IMAGE" bash
    ;;
  *)
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
