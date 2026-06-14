"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Kind = "Income" | "Expense";
type ParentOption = {
  id: string;
  name: string;
  kind: Kind;
  parentId: string | null;
  archived: boolean;
};

export function CategoryForm({ categories }: { categories: ParentOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("Expense");
  const [parentId, setParentId] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only top-level categories of the chosen kind can be a parent.
  const parentOptions = categories.filter(
    (c) => c.parentId === null && c.kind === kind && !c.archived,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kind,
          color,
          parentId: parentId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Could not create category.",
        );
        return;
      }
      setName("");
      setParentId("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Type</span>
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
            {(["Expense", "Income"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setParentId("");
                }}
                className={cn(
                  "px-3 py-2 text-sm font-medium",
                  kind === k
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "Income" ? "Salary" : "Groceries"}
            required
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Parent (optional)</span>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
          >
            <option value="">— Top-level —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Color</span>
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            type="color"
            className="h-10 w-14 cursor-pointer rounded-md border border-gray-300"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add category"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
