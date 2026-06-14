// Known Prisma error codes we map to HTTP responses.
// https://www.prisma.io/docs/orm/reference/error-reference
export function isPrismaError(e: unknown, code: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === code
  );
}
