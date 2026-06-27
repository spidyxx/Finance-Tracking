// Pure occurrence math for recurring rules (DESIGN.md §6). All dates are
// UTC date-only. The sequence is computed from the rule's schedule, and
// advancing always re-resolves the canonical month/period so fixed-day rules
// don't drift (e.g. Jan 31 -> Feb 28 -> Mar 31, not Feb 28 -> Mar 28).

export type Frequency = "Weekly" | "Monthly" | "Yearly";

export type Recurrence = {
  frequency: Frequency;
  interval: number; // every N weeks/months/years (>= 1)
  dayOfMonth: number | null; // monthly fixed-day anchor (1-31), when !endOfMonth
  endOfMonth: boolean; // monthly: always the last calendar day
  startDate: Date; // UTC date-only
};

function mkUTC(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

/** Number of days in a given month (month0 = 0-11). */
function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function addDaysUTC(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function addMonths(year: number, month0: number, n: number) {
  const idx = year * 12 + month0 + n;
  return { year: Math.floor(idx / 12), month0: ((idx % 12) + 12) % 12 };
}

/** The occurrence date within a specific month for a monthly rule. */
function resolveMonthly(year: number, month0: number, r: Recurrence): Date {
  const day = r.endOfMonth
    ? lastDayOfMonth(year, month0)
    : Math.min(r.dayOfMonth ?? 1, lastDayOfMonth(year, month0));
  return mkUTC(year, month0, day);
}

/** Occurrence index 0 — the schedule's anchor in the start period. */
function occurrenceZero(r: Recurrence): Date {
  if (r.frequency === "Monthly") {
    return resolveMonthly(
      r.startDate.getUTCFullYear(),
      r.startDate.getUTCMonth(),
      r,
    );
  }
  // Weekly and yearly begin exactly on startDate.
  return r.startDate;
}

/** The next occurrence strictly after `current`, re-resolved (no drift). */
export function advance(r: Recurrence, current: Date): Date {
  if (r.frequency === "Weekly") {
    return addDaysUTC(current, r.interval * 7);
  }
  if (r.frequency === "Monthly") {
    const { year, month0 } = addMonths(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      r.interval,
    );
    return resolveMonthly(year, month0, r);
  }
  // Yearly: keep the start month/day, clamped (handles Feb 29).
  const month0 = r.startDate.getUTCMonth();
  const canonicalDay = r.startDate.getUTCDate();
  const year = current.getUTCFullYear() + r.interval;
  return mkUTC(year, month0, Math.min(canonicalDay, lastDayOfMonth(year, month0)));
}

/** The first occurrence on or after the rule's startDate. */
export function firstRun(r: Recurrence): Date {
  let occ = occurrenceZero(r);
  let guard = 0;
  while (occ.getTime() < r.startDate.getTime()) {
    occ = advance(r, occ);
    if (++guard > 1200) break;
  }
  return occ;
}

/**
 * Occurrences from `from` (inclusive) up to and including `until`, respecting an
 * optional end date. `from` is typically the rule's stored nextRunDate.
 */
export function occurrencesBetween(
  r: Recurrence,
  from: Date,
  until: Date,
  endDate: Date | null,
): Date[] {
  const out: Date[] = [];
  let occ = from;
  let guard = 0;
  while (occ.getTime() <= until.getTime()) {
    if (endDate && occ.getTime() > endDate.getTime()) break;
    out.push(occ);
    occ = advance(r, occ);
    if (++guard > 2000) break;
  }
  return out;
}
