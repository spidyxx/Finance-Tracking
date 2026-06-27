import Link from "next/link";
import { listAccountsWithBalances } from "@/services/accounts";
import {
  getMonthlySummary,
  type CategorySummary,
} from "@/services/summary";
import { formatEuros } from "@/lib/money";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonth(value: string | undefined): { year: number; month: number } {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const monthParam = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const { year, month } = parseMonth(monthParam);

  const [accounts, summary] = await Promise.all([
    listAccountsWithBalances(),
    getMonthlySummary(year, month),
  ]);

  const netWorthCents = accounts.reduce((sum, a) => sum + a.balanceCents, 0);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-500">Net worth across accounts</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {formatEuros(netWorthCents)}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-500">Accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">
            No accounts yet.{" "}
            <Link href="/accounts" className="underline">
              Add one
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <p className="truncate text-sm text-gray-500">{a.name}</p>
                <p
                  className={
                    a.balanceCents < 0
                      ? "mt-1 text-xl font-semibold text-red-600"
                      : "mt-1 text-xl font-semibold"
                  }
                >
                  {formatEuros(a.balanceCents)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Monthly breakdown */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-500">This month</h2>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/?month=${ym(prev.year, prev.month)}`}
              className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-100"
              aria-label="Previous month"
            >
              ‹
            </Link>
            <span className="min-w-[8.5rem] text-center font-medium">
              {monthLabel}
            </span>
            <Link
              href={`/?month=${ym(next.year, next.month)}`}
              className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-100"
              aria-label="Next month"
            >
              ›
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Income" cents={summary.incomeCents} tone="income" />
          <Stat label="Expenses" cents={summary.expenseCents} tone="expense" />
          <Stat label="Net" cents={summary.netCents} tone="net" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Breakdown
            title="Expenses by category"
            items={summary.expense}
            total={summary.expenseCents}
          />
          <Breakdown
            title="Income by category"
            items={summary.income}
            total={summary.incomeCents}
          />
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number;
  tone: "income" | "expense" | "net";
}) {
  const color =
    tone === "income"
      ? "text-green-600"
      : tone === "expense"
        ? "text-red-600"
        : cents < 0
          ? "text-red-600"
          : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>
        {formatEuros(cents)}
      </p>
    </div>
  );
}

function Breakdown({
  title,
  items,
  total,
}: {
  title: string;
  items: CategorySummary[];
  total: number;
}) {
  const max = items[0]?.totalCents ?? 0;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-500">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing recorded this month.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((top) => (
            <div key={top.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-black/10"
                    style={{ backgroundColor: top.color ?? "#9ca3af" }}
                  />
                  {top.name}
                </span>
                <span className="font-medium">{formatEuros(top.totalCents)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
                <div
                  className="h-full rounded"
                  style={{
                    width: max > 0 ? `${(top.totalCents / max) * 100}%` : "0%",
                    backgroundColor: top.color ?? "#9ca3af",
                  }}
                />
              </div>
              {top.children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between pl-5 text-xs text-gray-500"
                >
                  <span>{child.name}</span>
                  <span>{formatEuros(child.totalCents)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-gray-100 pt-2 text-sm font-medium">
            <span>Total</span>
            <span>{formatEuros(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
