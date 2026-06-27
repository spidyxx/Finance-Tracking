import Link from "next/link";
import { listRules } from "@/services/recurring";
import { listCategories } from "@/services/categories";
import {
  listAccountsWithBalances,
  getAccountNameMap,
} from "@/services/accounts";
import { formatEuros } from "@/lib/money";
import { formatDate, toISODate } from "@/lib/date";
import {
  RecurringDialog,
  type CategoryOption,
} from "@/components/recurring/recurring-dialog";
import { RecurringActions } from "@/components/recurring/recurring-actions";

export const dynamic = "force-dynamic";

type Rule = Awaited<ReturnType<typeof listRules>>[number];

function describeSchedule(rule: Rule): string {
  const n = rule.interval;
  if (rule.frequency === "Weekly") return n === 1 ? "Weekly" : `Every ${n} weeks`;
  if (rule.frequency === "Yearly") return n === 1 ? "Yearly" : `Every ${n} years`;
  const base = n === 1 ? "Monthly" : `Every ${n} months`;
  const day = rule.endOfMonth ? "last day" : `day ${rule.dayOfMonth}`;
  return `${base}, ${day}`;
}

export default async function RecurringPage() {
  const [rules, accounts, categories, nameMap] = await Promise.all([
    listRules(),
    listAccountsWithBalances(false),
    listCategories(false),
    getAccountNameMap(),
  ]);

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
  }));
  const ready = accountOptions.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recurring</h1>
        {ready && (
          <RecurringDialog
            mode="create"
            accounts={accountOptions}
            categories={categoryOptions}
          />
        )}
      </div>

      {!ready && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add an{" "}
          <Link href="/accounts" className="underline">
            account
          </Link>{" "}
          first to create recurring rules.
        </p>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-gray-500">
          No recurring rules yet. Use “New rule” to automate salary, rent, or a
          monthly savings transfer.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => {
            const target =
              rule.type === "Transfer"
                ? `→ ${(rule.counterpartyId && nameMap[rule.counterpartyId]) ?? "—"}`
                : rule.category
                  ? rule.category.parent
                    ? `${rule.category.parent.name} › ${rule.category.name}`
                    : rule.category.name
                  : "—";
            const sign =
              rule.type === "Income" ? "+" : rule.type === "Expense" ? "−" : "";
            return (
              <div
                key={rule.id}
                className={
                  "flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between" +
                  (rule.active ? "" : " opacity-70")
                }
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                      {rule.type}
                    </span>
                    <span className="font-medium">
                      {sign}
                      {formatEuros(rule.amountCents)}
                    </span>
                    <span className="truncate text-sm text-gray-500">
                      {rule.account.name} · {target}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {describeSchedule(rule)} ·{" "}
                    {rule.active ? (
                      <>next {formatDate(rule.nextRunDate)}</>
                    ) : (
                      <span className="text-amber-700">paused</span>
                    )}
                    {rule.endDate ? ` · until ${formatDate(rule.endDate)}` : ""}
                    {rule.details ? ` · ${rule.details}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RecurringDialog
                    mode="edit"
                    accounts={accountOptions}
                    categories={categoryOptions}
                    triggerClassName="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    initial={{
                      id: rule.id,
                      type: rule.type,
                      amountEuros: rule.amountCents / 100,
                      accountId: rule.accountId,
                      categoryId: rule.categoryId,
                      counterpartyId: rule.counterpartyId,
                      details: rule.details,
                      frequency: rule.frequency,
                      interval: rule.interval,
                      monthlyMode: rule.endOfMonth ? "eom" : "fixed",
                      dayOfMonth: rule.dayOfMonth,
                      startDate: toISODate(rule.startDate),
                      endDate: rule.endDate ? toISODate(rule.endDate) : null,
                    }}
                  />
                  <RecurringActions id={rule.id} active={rule.active} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
