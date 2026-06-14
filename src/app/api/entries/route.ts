import { NextResponse } from "next/server";
import { createEntrySchema, entryFilterSchema } from "@/schemas/entry";
import { createEntry, listEntries } from "@/services/entries";
import { errorResponse } from "@/lib/errors";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Drop empty query values so optional filters validate cleanly.
  const cleaned: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (v.trim() !== "") cleaned[k] = v;
  }
  const parsed = entryFilterSchema.safeParse(cleaned);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid filters", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const result = await listEntries(parsed.data);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const entry = await createEntry(parsed.data);
    return NextResponse.json(entry, { status: 201 });
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}
