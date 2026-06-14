// All monetary amounts are stored as integer minor units (euro cents) to avoid
// floating-point drift. These helpers convert to/from display values.

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/** Format integer cents as a localized EUR string, e.g. 123456 -> "1.234,56 €". */
export function formatEuros(cents: number): string {
  return EUR.format(cents / 100);
}

/** Convert a euro amount (possibly fractional) to integer cents. */
export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

/** Convert integer cents to a euro number (for inputs/charts). */
export function centsToEuros(cents: number): number {
  return cents / 100;
}
