import { EntryType } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ChildSummary = {
  id: string;
  name: string;
  color: string | null;
  totalCents: number;
};
export type CategorySummary = ChildSummary & { children: ChildSummary[] };

export type MonthlySummary = {
  year: number;
  month: number; // 1-12
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  income: CategorySummary[];
  expense: CategorySummary[];
};

/**
 * Income/expense totals by category for one month (DESIGN.md §5). Transfers are
 * excluded; entry amounts are tagged to the leaf category and rolled up to the
 * parent so each top-level total includes its sub-categories.
 */
export async function getMonthlySummary(
  year: number,
  month: number,
): Promise<MonthlySummary> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [grouped, categories] = await Promise.all([
    prisma.entry.groupBy({
      by: ["categoryId"],
      where: {
        type: { in: [EntryType.Income, EntryType.Expense] },
        date: { gte: start, lt: end },
      },
      _sum: { amountCents: true },
    }),
    prisma.category.findMany({
      select: { id: true, name: true, kind: true, color: true, parentId: true },
    }),
  ]);

  const leafTotal = new Map<string, number>();
  for (const g of grouped) {
    if (g.categoryId) leafTotal.set(g.categoryId, g._sum.amountCents ?? 0);
  }

  function buildKind(kind: "Income" | "Expense") {
    const tops = categories.filter(
      (c) => c.kind === kind && c.parentId === null,
    );
    const list: CategorySummary[] = [];
    let total = 0;
    for (const top of tops) {
      const own = leafTotal.get(top.id) ?? 0;
      const children = categories
        .filter((c) => c.parentId === top.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          totalCents: leafTotal.get(c.id) ?? 0,
        }));
      const topTotal =
        own + children.reduce((s, c) => s + c.totalCents, 0);
      if (topTotal <= 0) continue;
      total += topTotal;
      list.push({
        id: top.id,
        name: top.name,
        color: top.color,
        totalCents: topTotal,
        children: children
          .filter((c) => c.totalCents > 0)
          .sort((a, b) => b.totalCents - a.totalCents),
      });
    }
    list.sort((a, b) => b.totalCents - a.totalCents);
    return { list, total };
  }

  const inc = buildKind("Income");
  const exp = buildKind("Expense");

  return {
    year,
    month,
    incomeCents: inc.total,
    expenseCents: exp.total,
    netCents: inc.total - exp.total,
    income: inc.list,
    expense: exp.list,
  };
}
