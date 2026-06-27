import { NextResponse } from "next/server";
import { updateRecurringSchema } from "@/schemas/recurring";
import { deleteRule, updateRule } from "@/services/recurring";
import { errorResponse } from "@/lib/api-errors";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateRecurringSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const rule = await updateRule(id, parsed.data);
    return NextResponse.json(rule);
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteRule(id);
    return new NextResponse(null, { status: 204 });
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}
