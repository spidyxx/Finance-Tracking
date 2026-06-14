import { CategoryKind, EntryType, Flow, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { eurosToCents } from "@/lib/money";
import { isoDateToUTC } from "@/lib/date";
import type {
  CreateEntryInput,
  EntryFilter,
  UpdateEntryInput,
} from "@/schemas/entry";

function flowForType(type: EntryType): Flow {
  return type === EntryType.Income ? Flow.In : Flow.Out;
}

async function assertAccount(accountId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new ServiceError("Account not found.", 400);
}

/** Income entries need an income category; expense entries an expense one. */
async function assertCategoryMatchesType(categoryId: string, type: EntryType) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });
  if (!category) throw new ServiceError("Category not found.", 400);
  const required =
    type === EntryType.Income ? CategoryKind.Income : CategoryKind.Expense;
  if (category.kind !== required) {
    throw new ServiceError(
      `A ${type.toLowerCase()} entry needs a ${required.toLowerCase()} category.`,
      400,
    );
  }
}

const listInclude = {
  account: { select: { name: true } },
  category: {
    select: { name: true, parentId: true, parent: { select: { name: true } } },
  },
} satisfies Prisma.EntryInclude;

export type EntryListItem = Prisma.EntryGetPayload<{
  include: typeof listInclude;
}>;

export async function listEntries(
  filter: EntryFilter,
): Promise<{ items: EntryListItem[]; total: number }> {
  const where: Prisma.EntryWhereInput = {};
  if (filter.from || filter.to) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filter.from) dateFilter.gte = isoDateToUTC(filter.from);
    if (filter.to) dateFilter.lte = isoDateToUTC(filter.to);
    where.date = dateFilter;
  }
  if (filter.accountId) where.accountId = filter.accountId;
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.type) where.type = filter.type as EntryType;

  const [items, total] = await Promise.all([
    prisma.entry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: filter.limit,
      skip: filter.offset,
      include: listInclude,
    }),
    prisma.entry.count({ where }),
  ]);
  return { items, total };
}

export async function createEntry(input: CreateEntryInput) {
  const type = input.type as EntryType;
  await assertAccount(input.accountId);
  await assertCategoryMatchesType(input.categoryId, type);

  return prisma.entry.create({
    data: {
      accountId: input.accountId,
      date: isoDateToUTC(input.date),
      amountCents: eurosToCents(input.amountEuros),
      type,
      flow: flowForType(type),
      categoryId: input.categoryId,
      details: input.details ?? "",
    },
  });
}

export async function updateEntry(id: string, input: UpdateEntryInput) {
  const current = await prisma.entry.findUnique({ where: { id } });
  if (!current) throw new ServiceError("Entry not found.", 404);
  if (current.type === EntryType.Transfer) {
    throw new ServiceError(
      "This entry is part of a transfer. Edit it from the transfer instead.",
      409,
    );
  }

  const type = (input.type as EntryType | undefined) ?? current.type;
  const accountId = input.accountId ?? current.accountId;
  const categoryId = input.categoryId ?? current.categoryId;

  if (input.accountId) await assertAccount(accountId);
  // Re-validate the category whenever the type or the category changes.
  if (input.type || input.categoryId) {
    if (!categoryId) throw new ServiceError("Category is required.", 400);
    await assertCategoryMatchesType(categoryId, type);
  }

  return prisma.entry.update({
    where: { id },
    data: {
      ...(input.date ? { date: isoDateToUTC(input.date) } : {}),
      ...(input.amountEuros !== undefined
        ? { amountCents: eurosToCents(input.amountEuros) }
        : {}),
      ...(input.accountId ? { accountId } : {}),
      ...(input.categoryId ? { categoryId } : {}),
      ...(input.type ? { type, flow: flowForType(type) } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
    },
  });
}

export async function deleteEntry(id: string) {
  const current = await prisma.entry.findUnique({ where: { id } });
  if (!current) throw new ServiceError("Entry not found.", 404);
  if (current.type === EntryType.Transfer) {
    throw new ServiceError(
      "This entry is part of a transfer. Delete it from the transfer instead.",
      409,
    );
  }
  await prisma.entry.delete({ where: { id } });
}
