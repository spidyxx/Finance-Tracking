import { Flow } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { eurosToCents } from "@/lib/money";
import type { CreateAccountInput, UpdateAccountInput } from "@/schemas/account";

export type AccountWithBalance = {
  id: string;
  name: string;
  openingCents: number;
  balanceCents: number;
  archived: boolean;
};

/**
 * List accounts with their current balance:
 *   balance = openingCents + Σ(in) - Σ(out)
 * computed from entries in a single grouped query (see DESIGN.md §5).
 */
export async function listAccountsWithBalances(
  includeArchived = false,
): Promise<AccountWithBalance[]> {
  const accounts = await prisma.account.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  const sums = await prisma.entry.groupBy({
    by: ["accountId", "flow"],
    _sum: { amountCents: true },
  });

  const deltaByAccount = new Map<string, number>();
  for (const row of sums) {
    const signed =
      (row._sum.amountCents ?? 0) * (row.flow === Flow.In ? 1 : -1);
    deltaByAccount.set(
      row.accountId,
      (deltaByAccount.get(row.accountId) ?? 0) + signed,
    );
  }

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    openingCents: a.openingCents,
    archived: a.archived,
    balanceCents: a.openingCents + (deltaByAccount.get(a.id) ?? 0),
  }));
}

export async function createAccount(input: CreateAccountInput) {
  return prisma.account.create({
    data: {
      name: input.name,
      openingCents: eurosToCents(input.openingEuros),
    },
  });
}

export async function updateAccount(id: string, input: UpdateAccountInput) {
  return prisma.account.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.openingEuros !== undefined
        ? { openingCents: eurosToCents(input.openingEuros) }
        : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
    },
  });
}

/** Move an active account up or down one slot, renormalizing positions. */
export async function moveAccount(id: string, direction: "up" | "down") {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) throw new ServiceError("Account not found.", 404);
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= accounts.length) return; // already at the edge

  const ids = accounts.map((a) => a.id);
  [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
  // Write dense positions 0..n in their new order (also normalizes legacy 0s).
  await prisma.$transaction(
    ids.map((aid, i) =>
      prisma.account.update({ where: { id: aid }, data: { position: i } }),
    ),
  );
}

/** id -> name for all accounts (incl. archived), for counterparty display. */
export async function getAccountNameMap(): Promise<Record<string, string>> {
  const accounts = await prisma.account.findMany({
    select: { id: true, name: true },
  });
  return Object.fromEntries(accounts.map((a) => [a.id, a.name]));
}
