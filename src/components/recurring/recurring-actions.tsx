"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecurringActions({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function send(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/recurring/${id}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(typeof data?.error === "string" ? data.error : "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => send("PATCH", { active: !active })}
        disabled={busy}
        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        {active ? "Pause" : "Resume"}
      </button>
      <button
        onClick={() => {
          if (
            confirm(
              "Delete this rule? Entries it already created are kept; only the rule is removed.",
            )
          ) {
            void send("DELETE");
          }
        }}
        disabled={busy}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
