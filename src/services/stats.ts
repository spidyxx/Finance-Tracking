import { EntryType, Flow } from "@prisma/client";
import { prisma } from "@/lib/db";

// All dates UTC. Buckets are calendar months ("YYYY-MM").

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const ey = to.getUTCFullYear();
  const em = to.getUTCMonth();
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    if (++m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export type StatsData = {
  months: string[];
  accountNames: string[];
  // [{ month, <accountName>: balanceCents, ... }]
  accountSeries: Record<string, number | string>[];
  netWorth: { month: string; cents: number }[];
  incomeExpense: {
    month: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }[];
  spending: { name: string; color: string | null; cents: number }[];
};

export async function getStats(from: Date, to: Date): Promise<StatsData> {
  const months = monthsBetween(from, to);
  const fromKey = months[0] ?? monthKey(from);

  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, openingCents: true },
  });

  // Net worth + per-account: every entry up to `to`, bucketed in JS.
  const entries = await prisma.entry.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) }, date: { lte: to } },
    select: { accountId: true, date: true, flow: true, amountCents: true },
  });

  // Per-account: baseline (opening + everything before the range) + monthly deltas.
  const baseline = new Map<string, number>();
  const monthly = new Map<string, Map<string, number>>();
  for (const a of accounts) {
    baseline.set(a.id, a.openingCents);
    monthly.set(a.id, new Map());
  }
  for (const e of entries) {
    const signed = (e.flow === Flow.In ? 1 : -1) * e.amountCents;
    const k = monthKey(e.date);
    if (k < fromKey) {
      baseline.set(e.accountId, (baseline.get(e.accountId) ?? 0) + signed);
    } else {
      const mm = monthly.get(e.accountId);
      if (mm) mm.set(k, (mm.get(k) ?? 0) + signed);
    }
  }

  const accountSeries: Record<string, number | string>[] = months.map((m) => ({
    month: m,
  }));
  const netWorth = months.map((m) => ({ month: m, cents: 0 }));
  for (const a of accounts) {
    let running = baseline.get(a.id) ?? 0;
    const mm = monthly.get(a.id);
    months.forEach((m, i) => {
      running += mm?.get(m) ?? 0;
      accountSeries[i][a.name] = running;
      netWorth[i].cents += running;
    });
  }

  // Income vs expense per month (transfers excluded by type filter).
  const ie = await prisma.entry.findMany({
    where: {
      type: { in: [EntryType.Income, EntryType.Expense] },
      date: { gte: from, lte: to },
    },
    select: { date: true, type: true, amountCents: true },
  });
  const ieMap = new Map<string, { income: number; expense: number }>();
  months.forEach((m) => ieMap.set(m, { income: 0, expense: 0 }));
  for (const e of ie) {
    const b = ieMap.get(monthKey(e.date));
    if (!b) continue;
    if (e.type === EntryType.Income) b.income += e.amountCents;
    else b.expense += e.amountCents;
  }
  const incomeExpense = months.map((m) => {
    const b = ieMap.get(m)!;
    return {
      month: m,
      incomeCents: b.income,
      expenseCents: b.expense,
      netCents: b.income - b.expense,
    };
  });

  // Spending by category over the range (expenses, rolled up to parent).
  const cats = await prisma.category.findMany({
    select: { id: true, name: true, color: true, parentId: true, kind: true },
  });
  const grouped = await prisma.entry.groupBy({
    by: ["categoryId"],
    where: { type: EntryType.Expense, date: { gte: from, lte: to } },
    _sum: { amountCents: true },
  });
  const leaf = new Map<string, number>();
  for (const g of grouped) {
    if (g.categoryId) leaf.set(g.categoryId, g._sum.amountCents ?? 0);
  }
  const spending = cats
    .filter((c) => c.kind === "Expense" && c.parentId === null)
    .map((t) => {
      const own = leaf.get(t.id) ?? 0;
      const children = cats
        .filter((c) => c.parentId === t.id)
        .reduce((s, c) => s + (leaf.get(c.id) ?? 0), 0);
      return { name: t.name, color: t.color, cents: own + children };
    })
    .filter((s) => s.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  return {
    months,
    accountNames: accounts.map((a) => a.name),
    accountSeries,
    netWorth,
    incomeExpense,
    spending,
  };
}
