# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js finance tracker (standalone output).
# Built with podman on the dev host; runs on Unraid against the existing Postgres.

FROM node:22-slim AS base
# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# --- deps: install node_modules from lockfile ---------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- build: generate Prisma client + compile Next -----------------------------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- run: minimal standalone runtime ------------------------------------------
FROM base AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV LOG_DIR=/app/logs

# Standalone server + static assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Prisma client runtime (the app queries the DB via @prisma/client).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# Rotating-file logging wrapper (deps-free) + its entrypoint script.
COPY --from=build /app/node_modules/rotating-file-stream ./node_modules/rotating-file-stream
COPY --from=build /app/logger-server.js ./logger-server.js

EXPOSE 3000
# Migrations are NOT run here (the standalone image has no Prisma CLI); apply
# them from the dev machine with `scripts/dev.sh prisma migrate deploy`.
CMD ["node", "logger-server.js"]
