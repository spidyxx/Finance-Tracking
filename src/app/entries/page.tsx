import Link from "next/link";
import { listEntries, type EntryListItem } from "@/services/entries";
import { listCategories } from "@/services/categories";
import {
  listAccountsWithBalances,
  getAccountNameMap,
} from "@/services/accounts";
import { entryFilterSchema } from "@/schemas/entry";
import { formatEuros } from "@/lib/money";
import { formatDate, toISODate } from "@/lib/date";
import {
  EntryDialog,
  type CategoryOption,
} from "@/components/entries/entry-dialog";
import { EntryDeleteButton } from "@/components/entries/entry-delete-button";
import { TransferDialog } from "@/components/transfers/transfer-dialog";
import { TransferDeleteButton } from "@/components/transfers/transfer-delete-button";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function categoryLabel(entry: EntryListItem): string {
  if (!entry.category) return "—";
  return entry.category.parent
    ? `${entry.category.parent.name} › ${entry.category.name}`
    : entry.category.name;
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && val.trim() !== "") cleaned[k] = val;
  }
  const filter = entryFilterSchema.parse(cleaned);

  const [{ items, total }, categories, accounts, nameMap] = await Promise.all([
    listEntries(filter),
    listCategories(false),
    listAccountsWithBalances(false),
    getAccountNameMap(),
  ]);

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const canTransfer = accountOptions.length >= 2;
  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
  }));
  const ready = accountOptions.length > 0 && categoryOptions.length > 0;

  const input =
    "rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-900";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Entries</h1>
        <div className="flex gap-2">
          {canTransfer && (
            <TransferDialog mode="create" accounts={accountOptions} />
          )}
          {ready && (
            <EntryDialog
              mode="create"
              accounts={accountOptions}
              categories={categoryOptions}
            />
          )}
        </div>
      </div>

      {!ready && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add at least one{" "}
          <Link href="/accounts" className="underline">
            account
          </Link>{" "}
          and one{" "}
          <Link href="/categories" className="underline">
            category
          </Link>{" "}
          before recording entries.
        </p>
      )}

      {/* Filter bar — plain GET form, server re-renders with the query string. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
      >
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          From
          <input
            type="date"
            name="from"
            defaultValue={filter.from ?? ""}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          To
          <input
            type="date"
            name="to"
            defaultValue={filter.to ?? ""}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Account
          <select
            name="accountId"
            defaultValue={filter.accountId ?? ""}
            className={input}
          >
            <option value="">All</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Category
          <select
            name="categoryId"
            defaultValue={filter.categoryId ?? ""}
            className={input}
          >
            <option value="">All</option>
            {categories
              .filter((c) => c.parentId === null)
              .map((top) => (
                <optgroup key={top.id} label={top.name}>
                  <option value={top.id}>{top.name}</option>
                  {categories
                    .filter((c) => c.parentId === top.id)
                    .map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {top.name} › {ch.name}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Type
          <select
            name="type"
            defaultValue={filter.type ?? ""}
            className={input}
          >
            <option value="">All</option>
            <option value="Income">Income</option>
            <option value="Expense">Expense</option>
            <option value="Transfer">Transfer</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Filter
        </button>
        <Link
          href="/entries"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Clear
        </Link>
      </form>

      <p className="text-xs text-gray-500">
        {total} {total === 1 ? "entry" : "entries"}
        {total > items.length ? ` (showing ${items.length})` : ""}
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Details</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  No entries match these filters.
                </td>
              </tr>
            ) : (
              items.map((e) => {
                const isIncome = e.flow === "In";
                const isTransfer = e.type === "Transfer";
                return (
                  <tr key={e.id} className="border-b border-gray-100 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(e.date)}
                    </td>
                    <td className="px-3 py-2">
                      {isTransfer ? (
                        <span className="text-gray-500">
                          Transfer {isIncome ? "←" : "→"}{" "}
                          {(e.counterpartyId && nameMap[e.counterpartyId]) ??
                            "—"}
                        </span>
                      ) : (
                        categoryLabel(e)
                      )}
                    </td>
                    <td className="px-3 py-2">{e.account.name}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-gray-600">
                      {e.details}
                    </td>
                    <td
                      className={
                        "whitespace-nowrap px-3 py-2 text-right font-medium " +
                        (isIncome ? "text-green-600" : "text-gray-900")
                      }
                    >
                      {isIncome ? "+" : "−"}
                      {formatEuros(e.amountCents)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {isTransfer ? (
                          e.transferGroupId && (
                            <>
                              <TransferDialog
                                mode="edit"
                                accounts={accountOptions}
                                triggerClassName="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                                initial={{
                                  groupId: e.transferGroupId,
                                  date: toISODate(e.date),
                                  amountEuros: e.amountCents / 100,
                                  fromAccountId: isIncome
                                    ? (e.counterpartyId ?? "")
                                    : e.accountId,
                                  toAccountId: isIncome
                                    ? e.accountId
                                    : (e.counterpartyId ?? ""),
                                  details: e.details,
                                }}
                              />
                              <TransferDeleteButton
                                groupId={e.transferGroupId}
                              />
                            </>
                          )
                        ) : (
                          <>
                            <EntryDialog
                              mode="edit"
                              accounts={accountOptions}
                              categories={categoryOptions}
                              triggerClassName="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                              initial={{
                                id: e.id,
                                date: toISODate(e.date),
                                amountEuros: e.amountCents / 100,
                                type: e.type as "Income" | "Expense",
                                accountId: e.accountId,
                                categoryId: e.categoryId ?? "",
                                details: e.details,
                              }}
                            />
                            <EntryDeleteButton id={e.id} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
