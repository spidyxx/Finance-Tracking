import { NextResponse } from "next/server";
import { updateTransferSchema } from "@/schemas/transfer";
import { deleteTransfer, updateTransfer } from "@/services/transfers";
import { errorResponse } from "@/lib/api-errors";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateTransferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const result = await updateTransfer(groupId, parsed.data);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  try {
    await deleteTransfer(groupId);
    return new NextResponse(null, { status: 204 });
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}
