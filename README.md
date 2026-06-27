# Finance Tracker

Self-hosted personal finance tracker (LAN-only). Record income/expenses across
multiple accounts, view/filter entries, see balances + monthly category
breakdowns, transfer between accounts, and automate recurring entries. An MCP
server lets an LLM read and modify the data.

See [DESIGN.md](DESIGN.md) for the full design.

**Stack:** Next.js 15 (App Router, TypeScript) · Prisma 6 · PostgreSQL ·
Tailwind v4 · iron-session · MCP. Money is stored as integer euro cents.

## Development

No Node install needed on the host — tooling runs in a container via `podman`
(see [scripts/dev.sh](scripts/dev.sh)):

```bash
cp .env.example .env        # then fill in real values
scripts/dev.sh install      # install dependencies
scripts/dev.sh prisma migrate dev --name init   # create DB schema
scripts/dev.sh dev          # http://localhost:3000  (also on the LAN)
```

Generate the login password hash:

```bash
scripts/dev.sh npm run hash-password -- "your-password"   # -> APP_PASSWORD_HASH
```

Run the MCP server (LAN-only, port 3001, bearer `MCP_API_KEY`):

```bash
scripts/dev.sh mcp        # Streamable HTTP at http://<host>:3001/mcp
```

If you do have Node installed locally, the usual `npm run dev` / `npm run
db:migrate` / `npm run build` scripts work too.

## Deployment (Unraid)

Build the image with podman, then run it against your existing Postgres
container. See [docker-compose.yml](docker-compose.yml) (it attaches to your
Postgres network and does **not** start its own database).

```bash
podman build -t finance-tracker:latest .
podman build -t finance-tracker-mcp:latest -f Dockerfile.mcp .   # MCP server
```

The web app and the MCP server run as two containers (see compose); both talk
to the same database. The web container runs the recurring scheduler.

Migrations are applied automatically on the web container's start (`prisma
migrate deploy`, see [docker-entrypoint.sh](docker-entrypoint.sh)).

Everything is LAN-only; off-site access is via WireGuard. Nothing is exposed to
the internet.

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (dedicated `finance` database) |
| `SESSION_SECRET` | cookie signing secret (≥32 chars) |
| `APP_PASSWORD_HASH` | bcrypt hash of the single login password |
| `MCP_API_KEY` | bearer token for the MCP server (LAN-only) |
| `PORT` / `MCP_PORT` | web UI / MCP ports (default 3000 / 3001) |
