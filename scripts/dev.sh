#!/usr/bin/env bash
# Run Node tooling inside a container via podman — no Node install on the host.
#
#   scripts/dev.sh install            # install deps + generate Prisma client
#   scripts/dev.sh dev                # next dev on http://0.0.0.0:3000 (LAN)
#   scripts/dev.sh build              # next build
#   scripts/dev.sh prisma <args...>   # e.g. prisma migrate dev --name init
#   scripts/dev.sh npm <args...>      # arbitrary npm command
#   scripts/dev.sh exec <cmd...>      # arbitrary command in the container
#   scripts/dev.sh shell              # interactive shell
set -euo pipefail

# Local dev image: node + openssl (Prisma needs openssl at runtime to pick the
# correct query engine). Built from Dockerfile.dev on first use.
DEV_IMAGE="localhost/finance-tracker-dev:latest"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Persist npm cache between runs for faster installs.
CACHE_VOL="finance-tracker-npm-cache"

ensure_image() {
  if ! podman image exists "$DEV_IMAGE"; then
    echo "[dev.sh] Building dev image ($DEV_IMAGE)…" >&2
    podman build -t "$DEV_IMAGE" -f "$PROJECT_DIR/Dockerfile.dev" "$PROJECT_DIR" >&2
  fi
}

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

ensure_image
cmd="${1:-}"; shift || true

case "$cmd" in
  install)
    run "$DEV_IMAGE" sh -c 'npm install && npx prisma generate'
    ;;
  dev)
    # Publish 3000 and bind Next to 0.0.0.0 so it is reachable on the LAN.
    run -p 3000:3000 "$DEV_IMAGE" sh -c 'npm run dev -- -H 0.0.0.0 -p 3000'
    ;;
  build)
    run "$DEV_IMAGE" sh -c 'npx prisma generate && npm run build'
    ;;
  prisma)
    run "$DEV_IMAGE" sh -c 'npx prisma "$@"' _ "$@"
    ;;
  npm)
    run "$DEV_IMAGE" npm "$@"
    ;;
  exec)
    run "$DEV_IMAGE" "$@"
    ;;
  shell)
    run "$DEV_IMAGE" bash
    ;;
  *)
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
