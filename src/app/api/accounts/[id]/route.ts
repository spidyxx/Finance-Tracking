import { NextResponse } from "next/server";
import { updateAccountSchema } from "@/schemas/account";
import { updateAccount } from "@/services/accounts";
import { isPrismaError } from "@/lib/prisma-errors";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const account = await updateAccount(id, parsed.data);
    return NextResponse.json(account);
  } catch (e: unknown) {
    if (isPrismaError(e, "P2025")) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (isPrismaError(e, "P2002")) {
      return NextResponse.json(
        { error: "An account with that name already exists." },
        { status: 409 },
      );
    }
    throw e;
  }
}
