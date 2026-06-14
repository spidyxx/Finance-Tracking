"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toISODate } from "@/lib/date";

type Kind = "Income" | "Expense";
export type AccountOption = { id: string; name: string };
export type CategoryOption = {
  id: string;
  name: string;
  kind: Kind;
  parentId: string | null;
};
export type EntryInitial = {
  id: string;
  date: string;
  amountEuros: number;
  type: Kind;
  accountId: string;
  categoryId: string;
  details: string;
};

function categoryOptions(categories: CategoryOption[], kind: Kind) {
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

export function EntryDialog({
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
  initial?: EntryInitial;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(initial?.date ?? toISODate(new Date()));
  const [type, setType] = useState<Kind>(initial?.type ?? "Expense");
  const [amount, setAmount] = useState(
    initial ? String(initial.amountEuros) : "",
  );
  const [accountId, setAccountId] = useState(
    initial?.accountId ?? accounts[0]?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const opts = useMemo(
    () => categoryOptions(categories, type),
    [categories, type],
  );

  function onTypeChange(next: Kind) {
    setType(next);
    // Clear category if it no longer matches the selected kind.
    if (!categories.some((c) => c.id === categoryId && c.kind === next)) {
      setCategoryId("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        date,
        amountEuros: Number(amount),
        type,
        accountId,
        categoryId,
        details,
      };
      const res = await fetch(
        mode === "create" ? "/api/entries" : `/api/entries/${initial!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data?.error === "string" ? data.error : "Could not save entry.",
        );
        return;
      }
      setOpen(false);
      if (mode === "create") {
        setAmount("");
        setDetails("");
        setCategoryId("");
      }
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
        {triggerLabel ?? (mode === "create" ? "+ Add entry" : "Edit")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold">
              {mode === "create" ? "Add entry" : "Edit entry"}
            </h2>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
                {(["Expense", "Income"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onTypeChange(k)}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm font-medium",
                      type === k
                        ? "bg-gray-900 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-100",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Amount (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className={inputCls}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Account</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                  className={inputCls}
                >
                  {accounts.length === 0 && <option value="">No accounts</option>}
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Category</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  className={inputCls}
                >
                  <option value="">— Select —</option>
                  {opts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Details</span>
                <input
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Optional note"
                  className={inputCls}
                />
              </label>

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
