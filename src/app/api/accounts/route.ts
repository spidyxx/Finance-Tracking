import { NextResponse } from "next/server";
import { createAccountSchema } from "@/schemas/account";
import { createAccount, listAccountsWithBalances } from "@/services/accounts";
import { isPrismaError } from "@/lib/prisma-errors";

export async function GET() {
  const accounts = await listAccountsWithBalances(true);
  return NextResponse.json(accounts);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const account = await createAccount(parsed.data);
    return NextResponse.json(account, { status: 201 });
  } catch (e: unknown) {
    if (isPrismaError(e, "P2002")) {
      return NextResponse.json(
        { error: "An account with that name already exists." },
        { status: 409 },
      );
    }
    throw e;
  }
}
