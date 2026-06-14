"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AccountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          openingEuros: opening.trim() === "" ? 0 : Number(opening),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Could not create account.",
        );
        return;
      }
      setName("");
      setOpening("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">Account name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Girokonto"
          required
          className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:w-44">
        <span className="font-medium text-gray-700">Opening balance (€)</span>
        <input
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          type="number"
          step="0.01"
          placeholder="0.00"
          className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add account"}
      </button>
      {error && (
        <p className="text-sm text-red-600 sm:basis-full">{error}</p>
      )}
    </form>
  );
}
