import Link from "next/link";
import { listAccountsWithBalances } from "@/services/accounts";
import { formatEuros } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const accounts = await listAccountsWithBalances();
  const netWorthCents = accounts.reduce((sum, a) => sum + a.balanceCents, 0);

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

      <p className="text-xs text-gray-400">
        Income/expense breakdown by category will appear here once entries and
        categories are in place.
      </p>
    </div>
  );
}
