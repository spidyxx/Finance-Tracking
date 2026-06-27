import { NextResponse } from "next/server";
import { createTransferSchema } from "@/schemas/transfer";
import { createTransfer } from "@/services/transfers";
import { errorResponse } from "@/lib/errors";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createTransferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const transfer = await createTransfer(parsed.data);
    return NextResponse.json(transfer, { status: 201 });
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}
