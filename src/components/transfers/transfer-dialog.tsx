"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toISODate } from "@/lib/date";

export type AccountOption = { id: string; name: string };
export type TransferInitial = {
  groupId: string;
  date: string;
  amountEuros: number;
  fromAccountId: string;
  toAccountId: string;
  details: string;
};

export function TransferDialog({
  mode,
  accounts,
  initial,
  triggerLabel,
  triggerClassName,
}: {
  mode: "create" | "edit";
  accounts: AccountOption[];
  initial?: TransferInitial;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(initial?.date ?? toISODate(new Date()));
  const [amount, setAmount] = useState(
    initial ? String(initial.amountEuros) : "",
  );
  const [fromId, setFromId] = useState(
    initial?.fromAccountId ?? accounts[0]?.id ?? "",
  );
  const [toId, setToId] = useState(
    initial?.toAccountId ?? accounts[1]?.id ?? "",
  );
  const [details, setDetails] = useState(initial?.details ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (fromId === toId) {
      setError("Source and destination must be different accounts.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        mode === "create"
          ? "/api/transfers"
          : `/api/transfers/${initial!.groupId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            amountEuros: Number(amount),
            fromAccountId: fromId,
            toAccountId: toId,
            details,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Could not save transfer.",
        );
        return;
      }
      setOpen(false);
      if (mode === "create") {
        setAmount("");
        setDetails("");
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
          "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        }
      >
        {triggerLabel ?? (mode === "create" ? "⇄ Transfer" : "Edit")}
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
              {mode === "create" ? "Transfer money" : "Edit transfer"}
            </h2>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">From</span>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
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

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">To</span>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
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
