import { Flow } from "@prisma/client";
import { prisma } from "@/lib/db";
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
    orderBy: { createdAt: "asc" },
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
