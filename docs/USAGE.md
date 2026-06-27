# Finance Tracker — Usage Guide

How to configure, run, deploy, and operate the Finance Tracker. For how it works
internally see `IMPLEMENTATION.md`.

---

## 1. Prerequisites

- **Unraid server** running Docker, with the existing **PostgreSQL** container
  (`postgresql16`, reachable on the LAN at `192.168.178.70:5432`).
- **Dev/build machine** on the LAN with **rootless podman** (no Node needed on
  the host — all tooling runs in containers).
- **SSH access** to the Unraid box as `root@192.168.178.70` using the key in
  `~/.ssh/unraid-ssh-key` (configured in `~/.ssh/config`).
- WireGuard for off-site access (optional). Nothing is exposed to the internet.

## 2. Configuration (`.env`)

The app reads a single `.env` file. It is **gitignored** — never commit it.
There is a separate `.env` on the server (used by the containers) and one
locally (used for dev tooling and applying migrations).

> **Two hard rules for `.env`:**
> 1. **No quotes** around values. Deployment uses `docker run --env-file`, which
>    keeps quotes literally and breaks parsing.
> 2. **`APP_PASSWORD_HASH` must be base64** (see below), and the DB password in
>    `DATABASE_URL` must be **URL-percent-encoded**.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection to the `finance` DB |
| `SESSION_SECRET` | iron-session cookie signing secret (≥ 32 chars) |
| `APP_PASSWORD_HASH` | base64-encoded bcrypt hash of the login password |
| `MCP_API_KEY` | bearer token for the MCP server |
| `PORT` / `MCP_PORT` | in-container ports (keep `3000` / `3001`) |

Example (`.env.example` has the template):

```
DATABASE_URL=postgresql://finance:ENCODED_PASSWORD@192.168.178.70:5432/finance?schema=public
SESSION_SECRET=a-long-random-string-min-32-chars
APP_PASSWORD_HASH=JDJiJDEwJ...base64...
MCP_API_KEY=64hexchars
PORT=3000
MCP_PORT=3001
```

Generate the values:

```bash
# Login password hash (base64) — paste the output into APP_PASSWORD_HASH
scripts/dev.sh npm run hash-password -- "your-password"

# Session secret and MCP key
openssl rand -base64 48     # SESSION_SECRET
openssl rand -hex 32        # MCP_API_KEY
```

**Encoding the DB password:** if the Postgres password contains characters that
are special in a URL (`% $ ! @ : / #`), percent-encode them in `DATABASE_URL`
(e.g. `%` → `%25`, `$` → `%24`, `!` → `%21`). This is a URL requirement, separate
from the no-quotes rule.

> Container ports stay `3000`/`3001`; the **host** ports are set in `deploy.sh`
> (currently `4000`/`4001`). Don't change `PORT` in `.env` to remap — that only
> changes what the app listens on inside the container.

## 3. Database setup

One-time, on the Postgres server:

```bash
docker exec -it postgresql16 psql -U postgres
```
```sql
CREATE ROLE finance WITH LOGIN PASSWORD 'choose-a-strong-password';
ALTER ROLE finance CREATEDB;   -- needed for the migration shadow DB in dev
CREATE DATABASE finance OWNER finance;
\q
```

Apply the schema (migrations) from the dev machine — its `.env` `DATABASE_URL`
must point at the `finance` DB:

```bash
scripts/dev.sh prisma migrate deploy
```

The app **does not** migrate on container start, so run this whenever the schema
changes (then redeploy).

## 4. Local development

All tooling runs in a container via `scripts/dev.sh` (builds a small node +
openssl image on first use):

```bash
cp .env.example .env          # then fill in real values
scripts/dev.sh install        # install deps + generate Prisma client
scripts/dev.sh dev            # http://localhost:3000 (also on the LAN)
scripts/dev.sh mcp            # MCP server on :3001
scripts/dev.sh prisma <args>  # e.g. migrate dev --name <x>, studio
scripts/dev.sh build          # production build
```

## 5. Building the images

Built with podman on the dev machine:

```bash
podman build -t finance-tracker:latest .
podman build -t finance-tracker-mcp:latest -f Dockerfile.mcp .
```

(`deploy.sh` builds them on the Unraid server, so you normally don't run these
by hand.)

## 6. Deployment

Deployment is `deploy.sh` (gitignored — server-specific). It mirrors the
Discord-bot pattern: `rsync` the source to the Unraid box, then `docker build` +
`docker run` over SSH. **No docker-compose** (Unraid has none).

```bash
./deploy.sh           # web + MCP (default)
./deploy.sh web       # web only
./deploy.sh mcp       # MCP only
```

What it does:
1. `rsync` the working tree to `/mnt/user/appdata/finance-tracker` (excludes
   `.git`, `node_modules`, `.next`, `.env`).
2. Aborts if the **server `.env`** is missing (seeds `.env.example` so you can
   fill it in) — it never overwrites server secrets.
3. Builds and (re)runs two containers, `--restart unless-stopped`, `--env-file
   .env`, with the logs volume mounted:
   - `finance-tracker` → host **`:4000`** → container `3000`
   - `finance-mcp` → host **`:4001`** → container `3001`

After deploy: web UI at `http://192.168.178.70:4000`, MCP at
`http://192.168.178.70:4001/mcp`. The containers appear in Unraid's Docker tab as
plain CLI containers (no Unraid template — normal).

### Auto-deploy on commit
A git **post-commit** hook runs `deploy.sh` after every commit, and a
**pre-commit** hook bumps the patch version in `src/version.ts` (shown in the
UI). So `git commit` will: bump version → commit → rsync + rebuild + redeploy.
(`deploy.sh` rsyncs the working tree, so you can also deploy uncommitted changes
by running it directly.)

## 7. Operations

### Logs
The web container writes rotating logs (daily, 30 days kept) to a mounted
volume:

- In-container: `/app/logs/app.log` (+ `app-YYYY-MM-DD.log`).
- On the host: `/mnt/cache/appdata/finance-tracker/logs/` (cache path so the
  AppData Backup plugin picks it up).

View them:

```bash
ssh root@192.168.178.70 'tail -f /mnt/cache/appdata/finance-tracker/logs/app.log'
# or container stdout:
ssh root@192.168.178.70 'docker logs -f finance-tracker'
```

### Versioning
`src/version.ts` (`APP_VERSION`) is auto-incremented (patch) by the pre-commit
hook and shown on the login screen and in the sidebar footer.

### Connecting an LLM to the MCP server
Point an MCP client at the Streamable-HTTP endpoint with the bearer token.
Example (Claude Code CLI):

```bash
claude mcp add --transport http finance http://192.168.178.70:4001/mcp \
  --header "Authorization: Bearer <MCP_API_KEY>"
```

The LLM can then add/edit/delete entries, transfers, categories and recurring
rules, and pull summaries for analysis.

### Backups
- **Logs**: backed up by the AppData Backup plugin (they live under
  `/mnt/cache/appdata`).
- **Financial data lives in PostgreSQL**, not in this app's volumes — back up the
  Postgres database separately (e.g. `pg_dump` of the `finance` DB).

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login fails / locked out, "No password configured" | `APP_PASSWORD_HASH` empty or not base64. Regenerate with `npm run hash-password`, paste base64 into the server `.env`, redeploy. |
| `Error validating datasource db: the URL must start with postgresql://` | `.env` value is **quoted**. Remove the surrounding `"` from all values (docker `--env-file` keeps quotes literally). |
| Wrong DB password despite correct value | `%`/`$`/`!` in the password not URL-encoded in `DATABASE_URL`. Percent-encode them. |
| `prisma: not found` / restart loop | Old image that tried to migrate in-container. Current images don't; rebuild/redeploy. Apply migrations from dev instead. |
| `P1001 Can't reach database server` | Container can't reach `192.168.178.70:5432` (hairpin). Put `finance-tracker`/`finance-mcp` on the Postgres Docker network and use `postgresql16:5432` in `DATABASE_URL`. |
| `port is already in use` | Change the host port in `deploy.sh` (`WEB_PORT` / `MCP_PORT`), redeploy. |
| Container starts but page unreachable | Ensure `HOSTNAME=0.0.0.0` (set in the Dockerfile) and the `-p host:container` mapping is correct. |
| New schema field missing in prod | Run `scripts/dev.sh prisma migrate deploy` from dev (it targets the prod DB), then redeploy the app. |
