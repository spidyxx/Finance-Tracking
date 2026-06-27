import { NextResponse } from "next/server";
import { isPrismaError } from "@/lib/prisma-errors";
import { ServiceError } from "@/lib/errors";

/**
 * Convert a thrown error into a JSON error response, or return null if it is
 * not a recognised error (so the caller can rethrow / 500).
 */
export function errorResponse(e: unknown): NextResponse | null {
  if (e instanceof ServiceError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (isPrismaError(e, "P2002")) {
    return NextResponse.json({ error: "That already exists." }, { status: 409 });
  }
  if (isPrismaError(e, "P2025")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return null;
}
