import { NextResponse } from "next/server";
import { getUpcoming } from "@/services/recurring";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days"));
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 366
      ? Math.floor(daysRaw)
      : 30;
  const items = await getUpcoming(days);
  return NextResponse.json(items);
}
