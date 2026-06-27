import Link from "next/link";
import { getStats } from "@/services/stats";
import { isoDateToUTC } from "@/lib/date";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { StatsCharts } from "@/components/stats/stats-charts";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const PRESETS: [string, string][] = [
  ["3m", "3M"],
  ["6m", "6M"],
  ["12m", "12M"],
  ["ytd", "YTD"],
  ["all", "All"],
];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const range = typeof sp.range === "string" ? sp.range : "12m";
  const fromParam = typeof sp.from === "string" ? sp.from : undefined;
  const toParam = typeof sp.to === "string" ? sp.to : undefined;

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let to = new Date(Date.UTC(y, m + 1, 0)); // end of current month
  let from: Date;

  if (range === "custom" && fromParam && toParam) {
    from = isoDateToUTC(fromParam);
    to = isoDateToUTC(toParam);
  } else if (range === "ytd") {
    from = new Date(Date.UTC(y, 0, 1));
  } else if (range === "all") {
    const first = await prisma.entry.findFirst({
      orderBy: { date: "asc" },
      select: { date: true },
    });
    from = first
      ? new Date(Date.UTC(first.date.getUTCFullYear(), first.date.getUTCMonth(), 1))
      : new Date(Date.UTC(y, m, 1));
  } else {
    const n = range === "3m" ? 2 : range === "6m" ? 5 : 11;
    from = new Date(Date.UTC(y, m - n, 1));
  }

  const data = await getStats(from, to);

  const presetCls = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium",
      active ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-100",
    );
  const input =
    "rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-900";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Stats</h1>

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map(([k, label]) => (
          <Link key={k} href={`/stats?range=${k}`} className={presetCls(range === k)}>
            {label}
          </Link>
        ))}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="range" value="custom" />
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            From
            <input type="date" name="from" defaultValue={fromParam ?? ""} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            To
            <input type="date" name="to" defaultValue={toParam ?? ""} className={input} />
          </label>
          <button
            type="submit"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              range === "custom" ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-100",
            )}
          >
            Custom
          </button>
        </form>
      </div>

      <StatsCharts data={data} />
    </div>
  );
}
