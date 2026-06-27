import { EntryType, Flow, Prisma, type RecurringRule } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { isPrismaError } from "@/lib/prisma-errors";
import { eurosToCents } from "@/lib/money";
import { isoDateToUTC, todayUTC } from "@/lib/date";
import {
  advance,
  firstRun,
  occurrencesBetween,
  type Recurrence,
} from "@/lib/recurrence";
import type {
  CreateRecurringInput,
  UpdateRecurringInput,
} from "@/schemas/recurring";

function toRecurrence(rule: RecurringRule): Recurrence {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    dayOfMonth: rule.dayOfMonth,
    endOfMonth: rule.endOfMonth,
    startDate: rule.startDate,
  };
}

type RuleType = "Income" | "Expense" | "Transfer";

async function validateTargets(input: {
  type: RuleType;
  accountId: string;
  categoryId?: string | null;
  counterpartyId?: string | null;
}) {
  const account = await prisma.account.findUnique({
    where: { id: input.accountId },
  });
  if (!account) throw new ServiceError("Account not found.", 400);

  if (input.type === "Transfer") {
    if (!input.counterpartyId) {
      throw new ServiceError("Transfer rules need a destination account.", 400);
    }
    if (input.counterpartyId === input.accountId) {
      throw new ServiceError(
        "Source and destination must be different accounts.",
        400,
      );
    }
    const dest = await prisma.account.findUnique({
      where: { id: input.counterpartyId },
    });
    if (!dest) throw new ServiceError("Destination account not found.", 400);
  } else {
    if (!input.categoryId) {
      throw new ServiceError("Income/expense rules need a category.", 400);
    }
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!category) throw new ServiceError("Category not found.", 400);
    const required = input.type === "Income" ? "Income" : "Expense";
    if (category.kind !== required) {
      throw new ServiceError(
        `A ${input.type.toLowerCase()} rule needs a ${required.toLowerCase()} category.`,
        400,
      );
    }
  }
}

/** Default a monthly fixed-day rule's anchor to the start day if unset. */
function resolveDayOfMonth(
  frequency: "Weekly" | "Monthly" | "Yearly",
  endOfMonth: boolean,
  dayOfMonth: number | null,
  startDate: Date,
): number | null {
  if (frequency === "Monthly" && !endOfMonth && dayOfMonth == null) {
    return startDate.getUTCDate();
  }
  return dayOfMonth;
}

/** Entry rows to create for one occurrence (1 for income/expense, 2 for transfer). */
function occurrenceEntries(
  rule: RecurringRule,
  date: Date,
): Prisma.EntryUncheckedCreateInput[] {
  const common = {
    date,
    amountCents: rule.amountCents,
    details: rule.details,
    recurringRuleId: rule.id,
  };
  if (rule.type === EntryType.Transfer) {
    const transferGroupId = crypto.randomUUID();
    return [
      {
        ...common,
        accountId: rule.accountId,
        type: EntryType.Transfer,
        flow: Flow.Out,
        transferGroupId,
        counterpartyId: rule.counterpartyId,
      },
      {
        ...common,
        accountId: rule.counterpartyId!,
        type: EntryType.Transfer,
        flow: Flow.In,
        transferGroupId,
        counterpartyId: rule.accountId,
      },
    ];
  }
  return [
    {
      ...common,
      accountId: rule.accountId,
      type: rule.type,
      flow: rule.type === EntryType.Income ? Flow.In : Flow.Out,
      categoryId: rule.categoryId,
    },
  ];
}

/**
 * Generate all occurrences due on or before `today` for one rule, advancing its
 * nextRunDate pointer. Idempotent: driven by the pointer, not by checking for
 * existing rows, so deleting a generated entry never recreates it.
 */
export async function generateForRule(
  rule: RecurringRule,
  today: Date,
): Promise<number> {
  if (!rule.active) return 0;
  const rec = toRecurrence(rule);
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let next = rule.nextRunDate;
  let generated = 0;
  let guard = 0;

  while (
    next.getTime() <= today.getTime() &&
    (!rule.endDate || next.getTime() <= rule.endDate.getTime())
  ) {
    for (const data of occurrenceEntries(rule, next)) {
      ops.push(prisma.entry.create({ data }));
    }
    generated++;
    next = advance(rec, next);
    if (++guard > 1000) break;
  }

  const deactivate =
    rule.endDate != null && next.getTime() > rule.endDate.getTime();
  ops.push(
    prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextRunDate: next, ...(deactivate ? { active: false } : {}) },
    }),
  );
  await prisma.$transaction(ops);
  return generated;
}

/** Run all active rules that are due. Called on boot and daily. */
export async function generateDue(today: Date = todayUTC()): Promise<number> {
  const due = await prisma.recurringRule.findMany({
    where: { active: true, nextRunDate: { lte: today } },
  });
  let total = 0;
  for (const rule of due) total += await generateForRule(rule, today);
  return total;
}

export async function listRules() {
  return prisma.recurringRule.findMany({
    orderBy: [{ active: "desc" }, { nextRunDate: "asc" }],
    include: {
      account: { select: { name: true } },
      category: { select: { name: true, parent: { select: { name: true } } } },
    },
  });
}

export async function createRule(input: CreateRecurringInput) {
  await validateTargets(input);
  const startDate = isoDateToUTC(input.startDate);
  const endDate = input.endDate ? isoDateToUTC(input.endDate) : null;
  const endOfMonth = input.endOfMonth ?? false;
  const dayOfMonth = resolveDayOfMonth(
    input.frequency,
    endOfMonth,
    input.dayOfMonth ?? null,
    startDate,
  );
  const nextRunDate = firstRun({
    frequency: input.frequency,
    interval: input.interval,
    dayOfMonth,
    endOfMonth,
    startDate,
  });
  const isTransfer = input.type === "Transfer";

  const rule = await prisma.recurringRule.create({
    data: {
      accountId: input.accountId,
      type: input.type as EntryType,
      amountCents: eurosToCents(input.amountEuros),
      categoryId: isTransfer ? null : input.categoryId!,
      counterpartyId: isTransfer ? input.counterpartyId! : null,
      details: input.details ?? "",
      frequency: input.frequency,
      interval: input.interval,
      dayOfMonth,
      endOfMonth,
      startDate,
      endDate,
      nextRunDate,
      active: true,
    },
  });

  // Materialise anything already due (e.g. a start date of today).
  await generateForRule(rule, todayUTC());
  // Re-fetch so the response reflects the advanced nextRunDate.
  return (await prisma.recurringRule.findUnique({ where: { id: rule.id } }))!;
}

export async function updateRule(id: string, input: UpdateRecurringInput) {
  const current = await prisma.recurringRule.findUnique({ where: { id } });
  if (!current) throw new ServiceError("Rule not found.", 404);
  const type = current.type as RuleType;

  if (
    input.accountId ||
    input.categoryId !== undefined ||
    input.counterpartyId !== undefined
  ) {
    await validateTargets({
      type,
      accountId: input.accountId ?? current.accountId,
      categoryId:
        input.categoryId !== undefined ? input.categoryId : current.categoryId,
      counterpartyId:
        input.counterpartyId !== undefined
          ? input.counterpartyId
          : current.counterpartyId,
    });
  }

  const startDate = input.startDate
    ? isoDateToUTC(input.startDate)
    : current.startDate;
  const endDate =
    input.endDate !== undefined
      ? input.endDate
        ? isoDateToUTC(input.endDate)
        : null
      : current.endDate;
  const frequency = input.frequency ?? current.frequency;
  const interval = input.interval ?? current.interval;
  const endOfMonth = input.endOfMonth ?? current.endOfMonth;
  const dayOfMonth = resolveDayOfMonth(
    frequency,
    endOfMonth,
    input.dayOfMonth !== undefined ? input.dayOfMonth : current.dayOfMonth,
    startDate,
  );

  const scheduleChanged =
    input.frequency !== undefined ||
    input.interval !== undefined ||
    input.dayOfMonth !== undefined ||
    input.endOfMonth !== undefined ||
    input.startDate !== undefined;

  const data: Prisma.RecurringRuleUncheckedUpdateInput = {
    frequency,
    interval,
    dayOfMonth,
    endOfMonth,
    startDate,
    endDate,
    ...(input.amountEuros !== undefined
      ? { amountCents: eurosToCents(input.amountEuros) }
      : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(type !== "Transfer" && input.categoryId !== undefined
      ? { categoryId: input.categoryId }
      : {}),
    ...(type === "Transfer" && input.counterpartyId !== undefined
      ? { counterpartyId: input.counterpartyId }
      : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };

  if (scheduleChanged) {
    // Recompute the next occurrence, resuming from today (no backfill on edit).
    const rec: Recurrence = { frequency, interval, dayOfMonth, endOfMonth, startDate };
    const today = todayUTC();
    let nr = firstRun(rec);
    let guard = 0;
    while (nr.getTime() < today.getTime()) {
      nr = advance(rec, nr);
      if (++guard > 2000) break;
    }
    data.nextRunDate = nr;
  }

  const updated = await prisma.recurringRule.update({ where: { id }, data });
  await generateForRule(updated, todayUTC());
  return (await prisma.recurringRule.findUnique({ where: { id } }))!;
}

export async function deleteRule(id: string) {
  try {
    // Generated entries are kept; their recurringRuleId is set null by the FK.
    await prisma.recurringRule.delete({ where: { id } });
  } catch (e: unknown) {
    if (isPrismaError(e, "P2025")) {
      throw new ServiceError("Rule not found.", 404);
    }
    throw e;
  }
}

export type UpcomingItem = {
  date: string;
  ruleId: string;
  type: string;
  amountCents: number;
  accountName: string;
  label: string;
  details: string;
};

export async function getUpcoming(days = 30): Promise<UpcomingItem[]> {
  const today = todayUTC();
  const until = new Date(today.getTime() + days * 86_400_000);
  const [rules, accounts, categories] = await Promise.all([
    prisma.recurringRule.findMany({ where: { active: true } }),
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const out: UpcomingItem[] = [];
  for (const rule of rules) {
    const rec = toRecurrence(rule);
    const dates = occurrencesBetween(
      rec,
      rule.nextRunDate,
      until,
      rule.endDate,
    ).filter((d) => d.getTime() >= today.getTime());
    for (const d of dates) {
      out.push({
        date: d.toISOString().slice(0, 10),
        ruleId: rule.id,
        type: rule.type,
        amountCents: rule.amountCents,
        accountName: accName.get(rule.accountId) ?? "—",
        label:
          rule.type === EntryType.Transfer
            ? `→ ${accName.get(rule.counterpartyId ?? "") ?? "—"}`
            : (catName.get(rule.categoryId ?? "") ?? "—"),
        details: rule.details,
      });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}
