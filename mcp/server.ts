// LAN-only MCP server over Streamable HTTP (stateless), reusing the same
// service layer as the web app. Protected by a bearer token (MCP_API_KEY).
// Run with: tsx mcp/server.ts  (see scripts/dev.sh mcp).
import "./load-env";
import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { ServiceError } from "@/lib/errors";
import { listAccountsWithBalances } from "@/services/accounts";
import { listCategories, createCategory } from "@/services/categories";
import {
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
} from "@/services/entries";
import {
  createTransfer,
  updateTransfer,
  deleteTransfer,
} from "@/services/transfers";
import { getMonthlySummary } from "@/services/summary";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
} from "@/services/recurring";

const PORT = Number(process.env.MCP_PORT) || 3001;
const API_KEY = process.env.MCP_API_KEY;

const eur = (cents: number) => cents / 100;
const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string) => ({
  content: [{ type: "text" as const, text: `Error: ${message}` }],
  isError: true,
});

// Wrap a service call so business errors become tool errors, not crashes.
function tool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      if (e instanceof ServiceError) return fail(e.message);
      return fail(e instanceof Error ? e.message : "Internal error");
    }
  };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

function buildServer() {
  const server = new McpServer({ name: "finance-tracker", version: "0.1.0" });

  // ---- reads -------------------------------------------------------------
  server.registerTool(
    "list_accounts",
    { description: "List accounts with current balances.", inputSchema: {} },
    tool(async () => {
      const accounts = await listAccountsWithBalances(true);
      return accounts.map((a) => ({
        ...a,
        balanceEur: eur(a.balanceCents),
        openingEur: eur(a.openingCents),
      }));
    }),
  );

  server.registerTool(
    "list_categories",
    {
      description: "List income/expense categories (with hierarchy).",
      inputSchema: { includeArchived: z.boolean().optional() },
    },
    tool(({ includeArchived }) => listCategories(includeArchived ?? false)),
  );

  server.registerTool(
    "list_entries",
    {
      description:
        "List entries with optional filters. Dates are YYYY-MM-DD. type is Income, Expense, or Transfer.",
      inputSchema: {
        from: isoDate.optional(),
        to: isoDate.optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        type: z.enum(["Income", "Expense", "Transfer"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    tool(async (args) => {
      const { items, total } = await listEntries({
        ...args,
        limit: args.limit ?? 200,
        offset: args.offset ?? 0,
      });
      return {
        total,
        items: items.map((e) => ({ ...e, amountEur: eur(e.amountCents) })),
      };
    }),
  );

  server.registerTool(
    "get_summary",
    {
      description:
        "Monthly income/expense totals by category (transfers excluded). Defaults to the current month.",
      inputSchema: {
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
      },
    },
    tool(async ({ year, month }) => {
      const now = new Date();
      const s = await getMonthlySummary(
        year ?? now.getUTCFullYear(),
        month ?? now.getUTCMonth() + 1,
      );
      return {
        ...s,
        incomeEur: eur(s.incomeCents),
        expenseEur: eur(s.expenseCents),
        netEur: eur(s.netCents),
      };
    }),
  );

  server.registerTool(
    "list_recurring",
    { description: "List recurring rules.", inputSchema: {} },
    tool(() => listRules()),
  );

  // ---- entry writes ------------------------------------------------------
  server.registerTool(
    "create_entry",
    {
      description: "Create an income or expense entry.",
      inputSchema: {
        date: isoDate,
        amountEuros: z.number().positive(),
        type: z.enum(["Income", "Expense"]),
        accountId: z.string(),
        categoryId: z.string(),
        details: z.string().optional(),
      },
    },
    tool((args) => createEntry({ ...args, details: args.details ?? "" })),
  );

  server.registerTool(
    "update_entry",
    {
      description: "Update fields of an existing income/expense entry.",
      inputSchema: {
        id: z.string(),
        date: isoDate.optional(),
        amountEuros: z.number().positive().optional(),
        type: z.enum(["Income", "Expense"]).optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        details: z.string().optional(),
      },
    },
    tool(({ id, ...rest }) => updateEntry(id, rest)),
  );

  server.registerTool(
    "delete_entry",
    { description: "Delete an entry by id.", inputSchema: { id: z.string() } },
    tool(async ({ id }) => {
      await deleteEntry(id);
      return { ok: true };
    }),
  );

  // ---- transfers ---------------------------------------------------------
  server.registerTool(
    "create_transfer",
    {
      description: "Transfer money between two accounts (linked, atomic).",
      inputSchema: {
        date: isoDate,
        amountEuros: z.number().positive(),
        fromAccountId: z.string(),
        toAccountId: z.string(),
        details: z.string().optional(),
      },
    },
    tool((args) => createTransfer({ ...args, details: args.details ?? "" })),
  );

  server.registerTool(
    "update_transfer",
    {
      description: "Update both sides of a transfer by its group id.",
      inputSchema: {
        groupId: z.string(),
        date: isoDate.optional(),
        amountEuros: z.number().positive().optional(),
        fromAccountId: z.string().optional(),
        toAccountId: z.string().optional(),
        details: z.string().optional(),
      },
    },
    tool(({ groupId, ...rest }) => updateTransfer(groupId, rest)),
  );

  server.registerTool(
    "delete_transfer",
    {
      description: "Delete a transfer (both sides) by its group id.",
      inputSchema: { groupId: z.string() },
    },
    tool(async ({ groupId }) => {
      await deleteTransfer(groupId);
      return { ok: true };
    }),
  );

  // ---- categories & recurring -------------------------------------------
  server.registerTool(
    "create_category",
    {
      description:
        "Create a category. Provide parentId to make it a sub-category (kind is inherited).",
      inputSchema: {
        name: z.string(),
        kind: z.enum(["Income", "Expense"]),
        color: z.string().optional(),
        parentId: z.string().optional(),
      },
    },
    tool((args) => createCategory(args)),
  );

  server.registerTool(
    "create_recurring",
    {
      description:
        "Create a recurring rule (Income/Expense/Transfer). Monthly: set dayOfMonth or endOfMonth.",
      inputSchema: {
        type: z.enum(["Income", "Expense", "Transfer"]),
        amountEuros: z.number().positive(),
        accountId: z.string(),
        categoryId: z.string().optional(),
        counterpartyId: z.string().optional(),
        details: z.string().optional(),
        frequency: z.enum(["Weekly", "Monthly", "Yearly"]),
        interval: z.number().int().min(1).optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        endOfMonth: z.boolean().optional(),
        startDate: isoDate,
        endDate: isoDate.optional(),
      },
    },
    tool((args) =>
      createRule({
        ...args,
        interval: args.interval ?? 1,
        endOfMonth: args.endOfMonth ?? false,
        details: args.details ?? "",
      }),
    ),
  );

  server.registerTool(
    "update_recurring",
    {
      description: "Update a recurring rule (future occurrences only).",
      inputSchema: {
        id: z.string(),
        amountEuros: z.number().positive().optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        counterpartyId: z.string().optional(),
        details: z.string().optional(),
        frequency: z.enum(["Weekly", "Monthly", "Yearly"]).optional(),
        interval: z.number().int().min(1).optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        endOfMonth: z.boolean().optional(),
        startDate: isoDate.optional(),
        endDate: isoDate.optional(),
        active: z.boolean().optional(),
      },
    },
    tool(({ id, ...rest }) => updateRule(id, rest)),
  );

  server.registerTool(
    "delete_recurring",
    {
      description: "Delete a recurring rule (generated entries are kept).",
      inputSchema: { id: z.string() },
    },
    tool(async ({ id }) => {
      await deleteRule(id);
      return { ok: true };
    }),
  );

  return server;
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!API_KEY) return false;
  return req.headers["authorization"] === `Bearer ${API_KEY}`;
}

// Stateful sessions: initialize creates a session (Mcp-Session-Id header);
// later requests reuse the stored transport.
const transports = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (url.pathname !== "/mcp") {
    res.writeHead(404).end("Not found");
    return;
  }
  if (!isAuthorized(req)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        if (sessionId || !isInitializeRequest(body)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: "No valid session — send initialize first." },
              id: null,
            }),
          );
          return;
        }
        // New session from an initialize request.
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
          },
        });
        transport.onclose = () => {
          if (transport!.sessionId) transports.delete(transport!.sessionId);
        };
        const server = buildServer();
        await server.connect(transport);
      }
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET (SSE stream) and DELETE (terminate) require an existing session.
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.writeHead(400).end("Unknown or missing session id");
      return;
    }
    await transport.handleRequest(req, res);
  } catch (e) {
    console.error("[mcp] request error:", e);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        }),
      );
    }
  }
});

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

if (!API_KEY) {
  console.warn(
    "[mcp] WARNING: MCP_API_KEY is not set — all requests will be rejected.",
  );
}
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[mcp] Streamable HTTP listening on 0.0.0.0:${PORT} (path /mcp)`);
});
