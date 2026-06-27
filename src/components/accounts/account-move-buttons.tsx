"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountMoveButtons({
  id,
  first,
  last,
}: {
  id: string;
  first: boolean;
  last: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function move(direction: "up" | "down") {
    setBusy(true);
    try {
      await fetch(`/api/accounts/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "px-1 leading-none text-gray-400 hover:text-gray-900 disabled:opacity-25";
  return (
    <div className="flex flex-col text-xs">
      <button onClick={() => move("up")} disabled={busy || first} className={btn} aria-label="Move up">
        ▲
      </button>
      <button onClick={() => move("down")} disabled={busy || last} className={btn} aria-label="Move down">
        ▼
      </button>
    </div>
  );
}
