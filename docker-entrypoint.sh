#!/bin/sh
set -e

# Apply any pending database migrations before starting the app.
# Safe to run on every boot; it only applies migrations not yet recorded.
if [ -d "./prisma/migrations" ]; then
  echo "[entrypoint] Applying database migrations..."
  npx prisma migrate deploy
else
  echo "[entrypoint] No migrations directory; skipping migrate deploy."
fi

echo "[entrypoint] Starting: $*"
exec "$@"
