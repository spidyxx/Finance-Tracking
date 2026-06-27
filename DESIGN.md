# Finance Tracker — Design Document

> Status: **Draft v1** · A self-hosted personal finance tracker for a home network.

## 1. Goals & Scope

A locally-hosted web app to record daily income/expenses across multiple
accounts, view and filter all entries, see balances and monthly category
breakdowns at a glance, and move money between accounts. An MCP server exposes
the same operations so an LLM can add/edit/delete entries and pull data for
analysis.

**Non-goals (for v1):** multi-user separation, bank-sync/import, budgets &
forecasting, multi-currency. All noted in §12 as future work.

### Confirmed decisions
- **Stack:** Next.js (TypeScript) full-stack, single container.
- **Auth:** single shared password, session cookie.
- **Balances:** `opening_balance + Σ(signed entries)`.
- **Currency:** EUR only (single-currency assumption baked into v1).
- **Deployment:** Docker container on Unraid, using the existing PostgreSQL container.
- **Recurring entries:** in scope for v1 — a scheduler auto-creates entries (incl. transfers) from rules.
- **Categories:** hierarchical (one level of sub-categories under a parent).
- **Seed data:** none — start with an empty category list.
- **MCP reach:** LAN-only (not exposed via the reverse proxy).
- **Network exposure:** nothing is published to the internet — the entire app
  (web UI + MCP) is LAN-only. Remote access is via the existing WireGuard tunnel.

## 2. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | UI + API routes in one deployable |
| Language | **TypeScript** | shared types/validation end-to-end |
| ORM | **Prisma** | migrations + typed client against Postgres |
| DB | **PostgreSQL** (existing Unraid container) | |
| UI | **React + Tailwind + shadcn/ui** | responsive desktop/mobile/tablet |
| Data fetching | **TanStack Query** | caching, optimistic edits |
| Forms / validation | **react-hook-form + Zod** | Zod schemas shared by API & MCP |
| Charts | **Recharts** | monthly category breakdown |
| Auth | **iron-session** (signed cookie) | single password |
| MCP | **@modelcontextprotocol/sdk** (TS) | reuses the shared service layer |
| Money | **integer minor units (cents)** | avoids float drift; formatted as EUR in UI |

## 3. Architecture

```
                 Home LAN
   ┌─────────────┴───────────────┐
   │                             │
Browser (PC/mobile/tablet)   MCP client (LLM, e.g. Claude)
   │  HTTPS/HTTP                 │  Streamable HTTP + Bearer token
   ▼                             ▼
┌───────────────────────────────────────────────┐
│            Container on Unraid                  │
│  ┌──────────────┐        ┌──────────────────┐  │
│  │ Next.js app  │        │  MCP server       │  │
│  │ (UI + /api)  │        │  (HTTP transport) │  │
│  └──────┬───────┘        └─────────┬─────────┘  │
│         │   both import the same   │            │
│         └────────► services/ ◄─────┘            │
│                      │                          │
│                  Prisma client                  │
└──────────────────────┼──────────────────────────┘
                        ▼
        PostgreSQL container (existing)
```

**Key architectural rule:** all business logic (validation, transfer linking,
balance math) lives in a framework-agnostic `services/` layer. Both the Next.js
API routes and the MCP server call it — never duplicate logic. This guarantees
that an LLM editing data and the UI editing data behave identically.

```
src/
  app/                # Next.js routes (pages + /api)
  components/
  lib/
    db.ts             # Prisma client singleton
    money.ts          # cents <-> EUR formatting
    auth.ts           # session helpers
  services/           # ← the single source of business logic
    entries.ts        # create/update/delete/list
    transfers.ts      # create/update/delete (two linked rows, atomic)
    accounts.ts
    categories.ts
    summary.ts        # balances + monthly breakdown
  schemas/            # Zod schemas, shared by api + forms + mcp
mcp/
  server.ts           # tool definitions -> services/*
prisma/
  schema.prisma
```

## 4. Data Model

Money is stored as **integer cents** (`amount_cents`). Every entry belongs to
exactly one account and has a `flow` (`in`/`out`) that determines its sign in
balance math — this keeps balance and transfer logic uniform.

```prisma
enum EntryType { income expense transfer }
enum Flow      { in out }
enum CategoryKind { income expense }

model Account {
  id             String   @id @default(uuid())
  name           String   @unique          // "Girokonto", "Tagesgeldkonto"
  openingCents   Int      @default(0)
  archived       Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  entries        Entry[]
}

model Category {
  id        String       @id @default(uuid())
  name      String
  kind      CategoryKind                    // income or expense
  color     String?                         // for charts
  archived  Boolean      @default(false)
  parentId  String?                          // null = top-level; else sub-category
  parent    Category?    @relation("Sub", fields: [parentId], references: [id])
  children  Category[]   @relation("Sub")
  entries   Entry[]
  @@unique([name, parentId, kind])
}

model Entry {
  id              String    @id @default(uuid())
  accountId       String
  account         Account   @relation(fields: [accountId], references: [id])
  date            DateTime  @db.Date
  amountCents     Int                        // always positive
  type            EntryType
  flow            Flow                        // in=+, out=- for balance
  categoryId      String?                     // null for transfers
  category        Category? @relation(fields: [categoryId], references: [id])
  details         String    @default("")
  // transfer linkage: the two rows of one transfer share transferGroupId
  transferGroupId String?
  counterpartyId  String?                     // other account (convenience)
  // provenance: set when an entry was generated by a recurring rule
  recurringRuleId String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([accountId, date])
  @@index([transferGroupId])
  @@index([recurringRuleId])
  @@index([date])
}

enum Frequency { weekly monthly yearly }

model RecurringRule {
  id              String     @id @default(uuid())
  accountId       String                       // source account
  type            EntryType                     // income | expense | transfer
  amountCents     Int
  categoryId      String?                       // null for transfer
  counterpartyId  String?                       // destination account, for transfer
  details         String     @default("")
  frequency       Frequency
  interval        Int        @default(1)        // every N weeks/months/years
  // monthly scheduling: either a fixed day, or always the last day of the month
  dayOfMonth      Int?                           // 1–31, used when !endOfMonth (monthly)
  endOfMonth      Boolean    @default(false)      // true = always last day of month
  startDate       DateTime   @db.Date
  endDate         DateTime?  @db.Date           // null = open-ended
  nextRunDate     DateTime   @db.Date           // next occurrence still to generate
  active          Boolean    @default(true)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@index([active, nextRunDate])
}
```

### Invariants
- `amountCents > 0` always; sign comes from `flow`.
- `type=income`  → `flow=in`,  requires `category.kind=income`.
- `type=expense` → `flow=out`, requires `category.kind=expense`.
- `type=transfer` → `categoryId=null`, exactly **two** rows share a
  `transferGroupId`: one `flow=out` on the source account, one `flow=in` on the
  destination, equal `amountCents` and `date`.

## 5. Balances & Summaries

**Account balance** (computed, never stored — so it can't drift):
```
balanceCents(account) = account.openingCents
  + Σ amountCents where flow=in  and accountId=account.id
  - Σ amountCents where flow=out and accountId=account.id
```

**Net worth** = Σ balances of non-archived accounts.

**Monthly category breakdown** (dashboard): filter `type IN (income, expense)`
within the selected month, group by `category`, split into income vs expense.
**Transfers are excluded** from this breakdown so moving money between your own
accounts never shows up as income or spending. Entries are tagged with the
**leaf** (most specific) category; the breakdown rolls leaf amounts up to their
parent so the dashboard can show a parent total that expands into sub-category
detail.

At personal scale these are simple aggregate queries. If the dashboard ever
feels slow we can add a materialized view or a cached monthly rollup (§12).

## 6. Transfers & Recurring Entries

### Transfers
A transfer is modeled as **two linked entries** rather than one special row, so
every table/balance query stays uniform.

- **Create:** in one DB transaction, insert two `type=transfer` rows sharing a
  new `transferGroupId` — `flow=out` (source) and `flow=in` (destination).
- **Edit:** changing amount, date, source, or destination updates **both** rows
  atomically. The UI presents a transfer as a single editable item.
- **Delete:** deleting either side deletes **both** rows in one transaction.

The `services/transfers.ts` functions own all of this; the API and MCP only call
them. A transfer can never end up half-applied.

### Recurring entries
A `RecurringRule` is a template + schedule that auto-generates real entries
(`recurringRuleId` set for provenance). Rules support `type` income, expense, **or
transfer** — so a fixed monthly savings transfer Giro → Tagesgeld can be
automated just like rent or salary.

- **Scheduler:** a daily in-process job (`node-cron`) plus a catch-up run on
  startup. For each active rule with `nextRunDate <= today` (and within
  `endDate`), it generates the entry — via `services/entries` or
  `services/transfers` for transfer rules — then advances `nextRunDate` by
  `interval × frequency`. It loops so multiple missed occurrences (after
  downtime) are all filled in.
- **Idempotency:** generation is driven by the rule's `nextRunDate` pointer, not
  by checking for existing rows — so deleting a generated entry never causes it
  to be re-created.
- **Generated entries are normal entries:** fully editable/deletable; editing one
  occurrence does not change the rule, and **editing the rule only affects future
  occurrences** (already-generated entries are left untouched).
- Pausing a rule (`active=false`) stops future generation without deleting past
  entries.

**Monthly scheduling** has two modes:
- **Fixed day** (`dayOfMonth`, 1–31): runs on that day each month. If a month is
  shorter than the chosen day (e.g. day 31 in February), it **clamps to the last
  day of that month**, then resumes the fixed day the following month.
- **End of month** (`endOfMonth=true`): always the **last calendar day** of the
  month regardless of length (28/29/30/31) — matching the "end of month" option
  in your banking app. `dayOfMonth` is ignored in this mode.

When advancing `nextRunDate`, the next occurrence is recomputed from the rule's
mode (not by adding a fixed number of days), so end-of-month and short-month
clamping stay correct every month.

## 7. HTTP API (Next.js route handlers)

All routes require a valid session cookie (§9). Request/response bodies validated
with the shared Zod schemas.

| Method & path | Purpose |
|---|---|
| `GET /api/accounts` | list accounts **with computed balances** |
| `POST /api/accounts` | create account (name, openingCents) |
| `PATCH /api/accounts/:id` | rename / set opening / archive |
| `GET /api/categories` | list categories |
| `POST /api/categories` | create (name, kind, color) |
| `PATCH /api/categories/:id` | edit / archive |
| `GET /api/entries` | list with filters: `from`, `to`, `categoryId`, `accountId`, `type`, pagination |
| `POST /api/entries` | create income/expense entry |
| `PATCH /api/entries/:id` | edit entry |
| `DELETE /api/entries/:id` | delete entry (cascades transfer pair) |
| `POST /api/transfers` | create transfer (from, to, amount, date, details) |
| `PATCH /api/transfers/:groupId` | edit both sides |
| `DELETE /api/transfers/:groupId` | delete both sides |
| `GET /api/recurring` | list recurring rules |
| `POST /api/recurring` | create rule (template + schedule) |
| `PATCH /api/recurring/:id` | edit / pause / resume rule (future occurrences only) |
| `DELETE /api/recurring/:id` | delete rule (keeps already-generated entries) |
| `GET /api/recurring/upcoming?days=30` | project active rules forward (no entries created) for the dashboard preview |
| `GET /api/summary?month=YYYY-MM` | dashboard payload: balances, net worth, monthly income/expense by category (parent + sub) |

## 8. Frontend / UX

Responsive layout (sidebar on desktop, bottom-nav/hamburger on mobile).

- **Dashboard (start page):** net worth across accounts + per-account balance
  cards; current-month income vs expense totals; category breakdown chart
  (donut/bar) with an income/expense toggle; month switcher. A prominent
  **"+ Add entry"** action. Also an **"Upcoming" panel** listing scheduled
  recurring entries for the next 30 days (date, account, amount, category) — a
  read-only forward projection, so no entries are created just by viewing it.
- **Entries:** filterable table (date-range picker, category, account, type).
  Inline/modal add, edit, delete. Transfers shown as a single linked row with a
  transfer icon. Add-transfer dialog (from → to, amount, date, note).
- **Accounts:** create/edit/archive accounts, set opening balance, see current
  balance.
- **Categories:** manage a two-level hierarchy (parent + sub-categories), each
  with name, kind, color. Category pickers display as `Parent › Sub`.
- **Recurring:** list rules with their next run date; create/edit/pause/delete.
  Same template fields as an entry plus frequency, interval, start, and optional
  end date.
- **Settings:** change password.

The **Add entry** form is the highest-traffic surface — date (defaults to today),
amount, account, category (parent › sub), details, and an
income/expense/transfer switch — and should be reachable in one tap from
anywhere. It also offers a "make this recurring" shortcut that pre-fills a rule.

## 9. Authentication

Single shared password for the whole app.

- Password hash stored in env (`APP_PASSWORD_HASH`, bcrypt/argon2). Login form
  posts the password; on success an **iron-session** signed, http-only cookie is
  set. Middleware protects all pages and `/api/*` except `/login`.
- Cookie secret in `SESSION_SECRET` env var; configurable session TTL with
  "remember me".
- **LAN-only, never internet-exposed.** Remote access goes through the existing
  WireGuard tunnel, which already encrypts everything in transit — so the single
  password is the only access control the app itself needs. (See §11 for the
  optional local-hostname/HTTPS niceties.)

## 10. MCP Server

A second process in the same image, exposing the service layer as MCP tools so an
LLM can manage entries and retrieve data for analysis.

- **Transport:** Streamable HTTP, so any MCP client on the network can connect
  (not tied to a single local machine). Protected by a **Bearer API key**
  (`MCP_API_KEY`) — separate from the human login.
- **Implementation:** thin wrappers over `services/*`, reusing the same Zod
  schemas for tool input validation. No business logic duplicated.

### Tools
| Tool | Maps to |
|---|---|
| `list_accounts` | accounts + balances |
| `list_categories` | categories |
| `list_entries` | filtered entries (date range, category, account, type) |
| `get_summary` | balances, net worth, monthly breakdown |
| `create_entry` | income/expense |
| `update_entry` | edit |
| `delete_entry` | delete (cascades transfer) |
| `create_transfer` | linked pair |
| `update_transfer` / `delete_transfer` | both sides |
| `create_category` | new category (optionally under a parent) |
| `list_recurring` | recurring rules |
| `create_recurring` / `update_recurring` / `delete_recurring` | manage rules |

Read tools return clean JSON (amounts as both cents and formatted EUR, categories
as `parent › sub`) so the LLM can compute statistics directly. Write tools
enforce the same invariants as the UI and return the resulting record.

## 11. Deployment (Unraid)

Single image, two processes (app + MCP). `docker-compose` connects to the
existing Postgres container's network.

```yaml
services:
  finance-tracker:
    image: finance-tracker:latest
    environment:
      DATABASE_URL: postgres://USER:PASS@postgres:5432/finance
      SESSION_SECRET: <random 32+ bytes>
      APP_PASSWORD_HASH: <argon2/bcrypt hash>
      MCP_API_KEY: <random token>
    ports:
      - "3000:3000"   # web UI
      - "3001:3001"   # MCP HTTP endpoint
    restart: unless-stopped
```

- `prisma migrate deploy` runs on container start to apply migrations.
- The recurring-entry scheduler starts with the app (catch-up run on boot, then
  daily). Single container = exactly one scheduler, so no duplicate generation.
- A separate `finance` database (or schema) in the existing Postgres instance.
- **No internet exposure / no port-forwarding.** Both the web UI (3000) and MCP
  (3001) are reachable only on the home LAN. Off-site access is via the existing
  **WireGuard** tunnel — once connected, the devices are effectively on the LAN.
- A reverse proxy (Unraid's SWAG/NPM) is *optional* and purely for LAN
  convenience — a nice hostname like `finance.home` and local HTTPS to avoid
  browser warnings. It is **not** required for security and never faces the
  internet.

## 12. Resolved Decisions & Future Work

**Resolved**
- Sub-categories → **yes**, one level (parent › sub).
- Recurring/scheduled entries → **yes, in v1** (incl. recurring transfers).
- MCP reachability → **LAN-only**.
- Network exposure → **none**; LAN-only, remote via WireGuard.
- Default category seed → **none**, start empty.
- Monthly recurring → supports **fixed day** (clamps to last day on short months)
  and an **end-of-month** mode (always the last calendar day).
- Editing a recurring rule → affects **future occurrences only**.
- Dashboard shows an **upcoming recurring** preview (next 30 days).

**Future enhancements**
- **Investment / ETF valuation** — a `Valuation` entry type (or asset-account
  flag) that adjusts an account's balance and counts toward net worth but is
  **excluded from income/expense** (the way transfers are). Manual revaluation
  only (no price feed; LAN-only). Lets the net-worth graph reflect market swings
  while spending stats stay clean. (Workaround today: an ETF account with dated
  income/expense "gain/loss" adjustment entries under dedicated categories.)
- Budgets per category + over-budget alerts.
- CSV/bank import & export.
- Multi-currency.
- Cached monthly rollups / materialized views if data grows large.
- Attachments (receipts) on entries.
- Multi-user accounts (separate logins) if needed later.
- Deeper than one level of sub-categories, if ever needed.
```
