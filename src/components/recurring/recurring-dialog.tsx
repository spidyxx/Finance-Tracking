"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toISODate } from "@/lib/date";

type RuleType = "Income" | "Expense" | "Transfer";
type Frequency = "Weekly" | "Monthly" | "Yearly";
type MonthlyMode = "fixed" | "eom";

export type AccountOption = { id: string; name: string };
export type CategoryOption = {
  id: string;
  name: string;
  kind: "Income" | "Expense";
  parentId: string | null;
};
export type RuleInitial = {
  id: string;
  type: RuleType;
  amountEuros: number;
  accountId: string;
  categoryId: string | null;
  counterpartyId: string | null;
  details: string;
  frequency: Frequency;
  interval: number;
  monthlyMode: MonthlyMode;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
};

function categoryOptions(categories: CategoryOption[], kind: "Income" | "Expense") {
  const tops = categories.filter((c) => c.kind === kind && c.parentId === null);
  const opts: { id: string; label: string }[] = [];
  for (const top of tops) {
    opts.push({ id: top.id, label: top.name });
    for (const child of categories.filter((c) => c.parentId === top.id)) {
      opts.push({ id: child.id, label: `${top.name} › ${child.name}` });
    }
  }
  return opts;
}

export function RecurringDialog({
  mode,
  accounts,
  categories,
  initial,
  triggerLabel,
  triggerClassName,
}: {
  mode: "create" | "edit";
  accounts: AccountOption[];
  categories: CategoryOption[];
  initial?: RuleInitial;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [type, setType] = useState<RuleType>(initial?.type ?? "Expense");
  const [amount, setAmount] = useState(initial ? String(initial.amountEuros) : "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [counterpartyId, setCounterpartyId] = useState(
    initial?.counterpartyId ?? accounts[1]?.id ?? "",
  );
  const [details, setDetails] = useState(initial?.details ?? "");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "Monthly");
  const [interval, setIntervalValue] = useState(initial ? String(initial.interval) : "1");
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(initial?.monthlyMode ?? "fixed");
  const [dayOfMonth, setDayOfMonth] = useState(
    initial?.dayOfMonth != null ? String(initial.dayOfMonth) : "",
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? toISODate(new Date()));
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const catOpts = useMemo(
    () => categoryOptions(categories, type === "Income" ? "Income" : "Expense"),
    [categories, type],
  );
  const unit =
    frequency === "Weekly" ? "week(s)" : frequency === "Monthly" ? "month(s)" : "year(s)";

  function onTypeChange(next: RuleType) {
    setType(next);
    if (next !== "Transfer" && !categories.some((c) => c.id === categoryId && c.kind === next)) {
      setCategoryId("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (type === "Transfer" && accountId === counterpartyId) {
      setError("Source and destination must be different accounts.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        type,
        amountEuros: Number(amount),
        accountId,
        categoryId: type === "Transfer" ? null : categoryId,
        counterpartyId: type === "Transfer" ? counterpartyId : null,
        details,
        frequency,
        interval: Number(interval),
        dayOfMonth:
          frequency === "Monthly" && monthlyMode === "fixed" && dayOfMonth !== ""
            ? Number(dayOfMonth)
            : null,
        endOfMonth: frequency === "Monthly" && monthlyMode === "eom",
        startDate,
        endDate: endDate || null,
      };
      const res = await fetch(
        mode === "create" ? "/api/recurring" : `/api/recurring/${initial!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : "Could not save rule.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        }
      >
        {triggerLabel ?? (mode === "create" ? "+ New rule" : "Edit")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold">
              {mode === "create" ? "New recurring rule" : "Edit recurring rule"}
            </h2>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
                {(["Expense", "Income", "Transfer"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={mode === "edit"}
                    onClick={() => onTypeChange(t)}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm font-medium disabled:opacity-60",
                      type === t ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-100",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Amount (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">
                    {type === "Transfer" ? "From" : "Account"}
                  </span>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    required
                    className={inputCls}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {type === "Transfer" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">To</span>
                  <select
                    value={counterpartyId}
                    onChange={(e) => setCounterpartyId(e.target.value)}
                    required
                    className={inputCls}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Category</span>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                    className={inputCls}
                  >
                    <option value="">— Select —</option>
                    {catOpts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Details</span>
                <input
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Optional note"
                  className={inputCls}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Frequency</span>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as Frequency)}
                    className={inputCls}
                  >
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Every</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={interval}
                      onChange={(e) => setIntervalValue(e.target.value)}
                      className={cn(inputCls, "w-20")}
                    />
                    <span className="text-gray-500">{unit}</span>
                  </div>
                </label>
              </div>

              {frequency === "Monthly" && (
                <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="monthlyMode"
                      checked={monthlyMode === "fixed"}
                      onChange={() => setMonthlyMode("fixed")}
                    />
                    On day
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(e.target.value)}
                      disabled={monthlyMode !== "fixed"}
                      placeholder="of start"
                      className={cn(inputCls, "w-24 px-2 py-1")}
                    />
                    <span className="text-gray-500">(clamped on short months)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="monthlyMode"
                      checked={monthlyMode === "eom"}
                      onChange={() => setMonthlyMode("eom")}
                    />
                    Last day of month
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Start date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">End date (optional)</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputCls}
                  />
                </label>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
