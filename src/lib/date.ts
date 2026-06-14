// Entry dates are stored as date-only (Prisma @db.Date). We treat them in UTC
// throughout to avoid off-by-one shifts when formatting.

/** Date -> "YYYY-MM-DD" (UTC), e.g. for <input type="date"> values. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date -> localized "DD.MM.YYYY" (UTC parts). */
export function formatDate(d: Date): string {
  const [y, m, day] = toISODate(d).split("-");
  return `${day}.${m}.${y}`;
}

/** "YYYY-MM-DD" -> Date at UTC midnight, for storage. */
export function isoDateToUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
