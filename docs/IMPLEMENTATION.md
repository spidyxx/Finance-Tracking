# Finance Tracker — Implementation Documentation

Technical reference for how the Finance Tracker is built. For the original
product design see `DESIGN.md`; for running and deploying it see `USAGE.md`.

> This document describes the **as-built** system, which differs from the
> original design in a few places (Prisma version, migration handling, logging,
> auth encoding, deployment). Those differences are called out under
> [Key decisions & gotchas](#key-decisions--gotchas).

---

## 1. Overview

A self-hosted, LAN-only personal finance tracker:

- Record income / expenses across multiple accounts.
- Transfer money between accounts (linked, atomic).
- Hierarchical income/expense categories.
- Recurring rules that auto-generate entries (incl. end-of-month).
- Dashboard (net worth, monthly category breakdown, upcoming).
- Stats page with time-series charts and a timespan filter.
- Single-password authentication.
- An MCP server so an LLM can read and modify the data.

Everything runs on the home LAN; remote access is via WireGuard. Nothing is
exposed to the internet.

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15.5 (App Router), React 19, TypeScript |
| ORM / DB | **Prisma 6** + PostgreSQL |
| Styling | Tailwind CSS v4 |
| Auth | iron-session (signed cookie) + bcryptjs |
| Charts | recharts |
| File logging | rotating-file-stream |
| MCP | `@modelcontextprotocol/sdk` (run via `tsx`) |
| Money | integer euro **cents** everywhere |

## 3. Architecture

Two containers share one PostgreSQL database and **one service layer**:

```
        Home LAN (+ WireGuard for remote)
   ┌───────────────┴────────────────┐
 Browser                        MCP client (LLM)
   │ :4000 (web UI + /api)          │ :4001 /mcp  (Bearer token)
   ▼                                ▼
┌──────────────────┐        ┌────────────────────┐
│ finance-tracker  │        │ finance-mcp        │
│ Next.js standalone│       │ tsx mcp/server.ts  │
│ + logger-server.js│       │                    │
│ + recurring sched.│       └─────────┬──────────┘
└─────────┬─────────┘                 │
          │   both import  src/services/*
          └──────────► Prisma ◄────────┘
                         │
                  PostgreSQL (existing Unraid container)
```

**Core rule:** all business logic lives in `src/services/*`. Both the Next.js
API routes and the MCP server call those services, so the UI and the LLM behave
identically. The MCP server runs as a **separate process** (its own container)
but imports the same TypeScript service modules.

The web container also runs the **recurring scheduler** (via Next's
`instrumentation.ts`). The MCP container does not, so there is exactly one
scheduler.

## 4. Repository structure

```
src/
  app/                      # Next.js App Router
    page.tsx                # Dashboard (net worth, breakdown, upcoming)
    login/                  # Login page
    accounts/ entries/ categories/ recurring/ stats/   # feature pages
    api/                    # Route handlers (accounts, entries, transfers,
                            #   categories, recurring, auth, ...)
  components/               # Client components (forms, dialogs, charts, nav)
  lib/                      # db, money, date, recurrence, session, errors, utils
  services/                # Business logic — the single source of truth
  schemas/                 # Zod schemas (shared by API, forms, MCP)
  instrumentation.ts       # Boots the recurring scheduler
  middleware.ts            # Auth gate for all pages/APIs
  version.ts               # APP_VERSION (auto-bumped by git hook)
mcp/
  server.ts                # MCP Streamable HTTP server
  load-env.ts              # Loads .env without dotenv-expand
prisma/schema.prisma       # Data model + migrations
logger-server.js           # Prod web entrypoint: rotating file logs + server
Dockerfile                 # Web image (Next standalone)
Dockerfile.mcp             # MCP image (tsx)
Dockerfile.dev             # Local dev image (node + openssl)
deploy.sh                  # rsync + docker build/run on Unraid (gitignored)
scripts/dev.sh             # Run all tooling via podman (no host Node)
```

## 5. Data model

Prisma schema (`prisma/schema.prisma`). Enum DB values are lowercase via
`@map`; TS members are capitalized.

- **Account** — `id`, `name` (unique), `openingCents`, `archived`, `position`
  (manual sort order), timestamps. Relations: entries, recurring rules.
- **Category** — `id`, `name`, `kind` (`Income`/`Expense`), `color`, `archived`,
  `parentId` (self-relation; one level → sub-categories). Unique on
  `[name, parentId, kind]`.
- **Entry** — `id`, `accountId`, `date` (`@db.Date`), `amountCents` (always
  positive), `type` (`Income`/`Expense`/`Transfer`), `flow` (`In`/`Out`),
  `categoryId` (null for transfers), `details`, `transferGroupId`,
  `counterpartyId`, `recurringRuleId`, timestamps.
- **RecurringRule** — template + schedule: `accountId`, `type`, `amountCents`,
  `categoryId`, `counterpartyId`, `details`, `frequency`
  (`Weekly`/`Monthly`/`Yearly`), `interval`, `dayOfMonth`, `endOfMonth`,
  `startDate`, `endDate`, `nextRunDate`, `active`.

Referential note: `Entry.recurringRule` is optional, so deleting a rule **sets
`recurringRuleId` to null** on its generated entries (they are kept).

## 6. Core concepts

### Money
Stored as integer **cents** to avoid float drift. `src/lib/money.ts` converts
to/from euros and formats `de-DE` currency.

### Balances
Computed, never stored (so they cannot drift):

```
balance(account) = openingCents + Σ amountCents(flow=In) − Σ amountCents(flow=Out)
```

`income → In`, `expense → Out`, transfer = `In` on destination / `Out` on
source. Negative balances are fully supported (e.g. credit cards) and reduce net
worth. Computed in `services/accounts.ts` with one grouped query.

### Transfers
A transfer is **two linked entries** sharing a `transferGroupId` — an `Out` row
on the source and an `In` row on the destination, equal amount and date, written
/ updated / deleted in a single `prisma.$transaction` so it can never be
half-applied. Transfers carry no category and are **excluded** from
income/expense totals and the category breakdown. See `services/transfers.ts`.

### Categories
One level of hierarchy. A sub-category inherits its parent's `kind`. Name
uniqueness is enforced **in the service** (`services/categories.ts`), because the
DB unique index does not catch duplicate top-level names (Postgres treats `NULL`
parentIds as distinct). Deleting a category is blocked if it has sub-categories
or referencing entries (archive instead).

### Entries
Income/expense entries validate that the category `kind` matches the entry type.
`flow` is derived from type. Transfer entries are edited/deleted via the transfer
endpoints, not the entry endpoints (guarded in `services/entries.ts`).

### Recurring rules
- **Occurrence math** (`src/lib/recurrence.ts`, pure + unit-tested): supports
  weekly/monthly/yearly with an interval. Monthly is either a fixed `dayOfMonth`
  (clamped on short months, e.g. day 31 → Feb 28) or `endOfMonth` (always the
  last calendar day). Advancing always re-resolves the canonical month so
  fixed-day rules don't drift (Jan 31 → Feb 28 → **Mar 31**). Leap years handled.
- **Scheduler** (`src/instrumentation.ts`): on web-server boot it runs a
  catch-up pass, then a self-rescheduling timer fires daily at ~00:05 local time.
  No external cron dependency.
- **Generation** (`services/recurring.ts`): driven by each rule's `nextRunDate`
  pointer (idempotent — deleting a generated entry never recreates it). For each
  due occurrence it creates the entry (or transfer pair) tagged with
  `recurringRuleId`, then advances the pointer. Editing a rule only affects
  future occurrences; deleting a rule keeps already-generated entries.
- **Upcoming**: `getUpcoming(days)` projects active rules forward without
  creating anything (dashboard panel).

### Stats aggregation
`services/stats.ts`, used by `/stats`:
- **Net worth** and **per-account** series are **adaptive granularity** — daily
  for ranges ≤ ~13 months (so intra-month movement shows), monthly beyond.
  Computed as a running balance from a baseline (opening + all entries before the
  range) plus per-bucket deltas.
- **Income vs expenses** is always per calendar month (bars); the **net line is
  cumulative** (running sum over the range). Transfers excluded.
- **Spending by category** is the range total, rolled up to parent categories.

## 7. Service layer (`src/services`)

| Module | Responsibilities |
|---|---|
| `accounts.ts` | list with balances, create, update, move (reorder), name map |
| `categories.ts` | hierarchical CRUD, kind inheritance, uniqueness, safe delete |
| `entries.ts` | income/expense CRUD, filters, type↔category validation |
| `transfers.ts` | atomic two-row create/update/delete |
| `recurring.ts` | rule CRUD, `generateDue`/`generateForRule`, `getUpcoming` |
| `summary.ts` | dashboard monthly breakdown |
| `stats.ts` | time-series + category aggregation for the Stats page |

Business errors throw `ServiceError` (`src/lib/errors.ts`), mapped to HTTP by
`src/lib/api-errors.ts` (web) or surfaced as tool errors (MCP). `errors.ts` is
kept free of `next/server` imports so services are importable by the MCP process.

## 8. HTTP API

All routes require a valid session cookie (except `/api/auth/*`). Bodies are
validated with the Zod schemas in `src/schemas`.

| Method & path | Purpose |
|---|---|
| `GET/POST /api/accounts`, `PATCH /api/accounts/:id`, `POST /api/accounts/:id/move` | accounts + reorder |
| `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id` | categories |
| `GET/POST /api/entries`, `PATCH/DELETE /api/entries/:id` | entries (GET takes filters) |
| `POST /api/transfers`, `PATCH/DELETE /api/transfers/:groupId` | transfers |
| `GET/POST /api/recurring`, `PATCH/DELETE /api/recurring/:id`, `GET /api/recurring/upcoming` | recurring |
| `POST /api/auth/login`, `POST /api/auth/logout` | auth |

## 9. Authentication

Single shared password.

- `src/middleware.ts` protects every page (redirect to `/login`) and every API
  (401), excluding `/login`, `/api/auth/*`, and static assets.
- `POST /api/auth/login` verifies the password with bcrypt and sets a signed
  http-only iron-session cookie (`SESSION_SECRET`). Cookie is **not** `secure`
  (LAN over HTTP).
- The password is stored as a **base64-encoded** bcrypt hash in
  `APP_PASSWORD_HASH` and decoded in the login route. See the gotcha below.

## 10. MCP server (`mcp/server.ts`)

- **Transport:** MCP Streamable HTTP with **stateful sessions** (initialize →
  `Mcp-Session-Id` → subsequent calls), on `MCP_PORT` (4001), path `/mcp`.
- **Auth:** `Authorization: Bearer <MCP_API_KEY>` on every request.
- **Tools:** `list_accounts`, `list_categories`, `list_entries`, `get_summary`,
  `list_recurring`, `create_entry`, `update_entry`, `delete_entry`,
  `create_transfer`, `update_transfer`, `delete_transfer`, `create_category`,
  `create_recurring`, `update_recurring`, `delete_recurring`. Each wraps a
  service call; read tools return amounts in both cents and euros.
- Runs via `tsx` (TypeScript without a build step). `mcp/load-env.ts` loads
  `.env` with Node's built-in parser (no dotenv-expand) before any service
  import.

## 11. Logging

The web container's entrypoint is `logger-server.js`, which tees all
stdout/stderr to a **daily-rotating** file in `LOG_DIR` (`/app/logs`), keeping
**30** rotated files (`app.log`, `app-YYYY-MM-DD.log`) — mirroring the Discord
bot's policy. Logging is best-effort: if the log file cannot be written the app
keeps running on console logging only (it never crashes). The log dir is a
mounted volume (see `USAGE.md`).

## 12. Key decisions & gotchas

These are non-obvious and easy to regress:

- **Prisma pinned to v6.** Prisma 7 removed `url` from the schema and requires
  mandatory driver adapters + a `prisma.config.ts`. v6 keeps the simple
  `url = env("DATABASE_URL")` model. Do not "upgrade".
- **No `node-cron`.** Its `node:crypto` import breaks the Next/webpack bundler.
  The scheduler uses a plain self-rescheduling `setTimeout`.
- **`APP_PASSWORD_HASH` is base64-encoded.** Next's env loader runs
  `dotenv-expand`, which mangles any value containing `$` (a bcrypt hash is full
  of them). Base64 avoids it; `npm run hash-password` emits base64.
- **`.env` values are unquoted.** Deployment uses `docker run --env-file`, which
  does **not** strip quotes — a quoted value keeps the literal `"` and breaks
  (e.g. Prisma: "URL must start with the protocol postgresql://"). For the same
  reason the DB password is URL-percent-encoded in `DATABASE_URL`.
- **Migrations are not run in the container.** The slim standalone image has no
  Prisma CLI. Apply migrations from the dev machine
  (`scripts/dev.sh prisma migrate deploy`); the running app only reads.
- **`HOSTNAME=0.0.0.0`** is set so the standalone server binds all interfaces and
  the published port works.
- **DB networking from a container on the Unraid host** uses the host LAN IP
  (`192.168.178.70:5432`) and relies on hairpin to the published Postgres port.
  If that ever fails, attach both containers to the Postgres Docker network and
  use the container name (`postgresql16:5432`).
