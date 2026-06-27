import { NextResponse } from "next/server";
import { moveAccount } from "@/services/accounts";
import { errorResponse } from "@/lib/api-errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const direction = body?.direction;
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json(
      { error: "direction must be 'up' or 'down'" },
      { status: 400 },
    );
  }
  try {
    await moveAccount(id, direction);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}
