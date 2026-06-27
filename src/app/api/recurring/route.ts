import { NextResponse } from "next/server";
import { createRecurringSchema } from "@/schemas/recurring";
import { createRule, listRules } from "@/services/recurring";
import { errorResponse } from "@/lib/api-errors";

export async function GET() {
  const rules = await listRules();
  return NextResponse.json(rules);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createRecurringSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const rule = await createRule(parsed.data);
    return NextResponse.json(rule, { status: 201 });
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}
