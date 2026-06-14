import { NextResponse } from "next/server";
import { createCategorySchema } from "@/schemas/category";
import { createCategory, listCategories } from "@/services/categories";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  const categories = await listCategories(true);
  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const category = await createCategory(parsed.data);
    return NextResponse.json(category, { status: 201 });
  } catch (e: unknown) {
    const res = errorResponse(e);
    if (res) return res;
    throw e;
  }
}
