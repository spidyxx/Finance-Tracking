import { EntryType, Flow } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toISODate } from "@/lib/date";

// All dates UTC. Net worth / per-account use day or month buckets (adaptive);
// income/expense is always per calendar month.
const DAY = 86_400_000;

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

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = startOfDay(from); t <= startOfDay(to); t += DAY) {
    out.push(toISODate(new Date(t)));
  }
  return out;
}

export type StatsData = {
  granularity: "day" | "month";
  periods: string[]; // keys for net worth / per-account
  accountNames: string[];
  accountSeries: Record<string, number | string>[]; // [{ period, <name>: cents }]
  netWorth: { period: string; cents: number }[];
  incomeExpense: {
    month: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }[];
  spending: { name: string; color: string | null; cents: number }[];
};

export async function getStats(from: Date, to: Date): Promise<StatsData> {
  const spanDays = Math.floor((startOfDay(to) - startOfDay(from)) / DAY) + 1;
  const granularity: "day" | "month" = spanDays <= 400 ? "day" : "month";
  const periods =
    granularity === "day" ? daysBetween(from, to) : monthsBetween(from, to);
  const keyOf = (d: Date) =>
    granularity === "day" ? toISODate(d) : monthKey(d);
  const fromKey = periods[0] ?? keyOf(from);

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

  // Per-account: baseline (opening + everything before the range) + per-bucket deltas.
  const baseline = new Map<string, number>();
  const perBucket = new Map<string, Map<string, number>>();
  for (const a of accounts) {
    baseline.set(a.id, a.openingCents);
    perBucket.set(a.id, new Map());
  }
  for (const e of entries) {
    const signed = (e.flow === Flow.In ? 1 : -1) * e.amountCents;
    const k = keyOf(e.date);
    if (k < fromKey) {
      baseline.set(e.accountId, (baseline.get(e.accountId) ?? 0) + signed);
    } else {
      perBucket.get(e.accountId)?.set(
        k,
        (perBucket.get(e.accountId)?.get(k) ?? 0) + signed,
      );
    }
  }

  const accountSeries: Record<string, number | string>[] = periods.map((k) => ({
    period: k,
  }));
  const netWorth = periods.map((k) => ({ period: k, cents: 0 }));
  for (const a of accounts) {
    let running = baseline.get(a.id) ?? 0;
    const mm = perBucket.get(a.id);
    periods.forEach((k, i) => {
      running += mm?.get(k) ?? 0;
      accountSeries[i][a.name] = running;
      netWorth[i].cents += running;
    });
  }

  // Income vs expense — always per calendar month (transfers excluded).
  const months = monthsBetween(from, to);
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
    granularity,
    periods,
    accountNames: accounts.map((a) => a.name),
    accountSeries,
    netWorth,
    incomeExpense,
    spending,
  };
}
