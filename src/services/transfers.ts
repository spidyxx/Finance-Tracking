import { EntryType, Flow } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { eurosToCents } from "@/lib/money";
import { isoDateToUTC } from "@/lib/date";
import type {
  CreateTransferInput,
  UpdateTransferInput,
} from "@/schemas/transfer";

async function assertAccount(id: string) {
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) throw new ServiceError("Account not found.", 400);
}

/**
 * A transfer is two linked entries sharing a transferGroupId: an `Out` row on
 * the source account and an `In` row on the destination, with equal amount and
 * date. Both are written/updated/deleted atomically so a transfer can never be
 * left half-applied. See DESIGN.md §6.
 */
export async function createTransfer(input: CreateTransferInput) {
  if (input.fromAccountId === input.toAccountId) {
    throw new ServiceError(
      "Source and destination must be different accounts.",
      400,
    );
  }
  await assertAccount(input.fromAccountId);
  await assertAccount(input.toAccountId);

  const transferGroupId = crypto.randomUUID();
  const amountCents = eurosToCents(input.amountEuros);
  const date = isoDateToUTC(input.date);
  const details = input.details ?? "";

  const [out, incoming] = await prisma.$transaction([
    prisma.entry.create({
      data: {
        accountId: input.fromAccountId,
        date,
        amountCents,
        type: EntryType.Transfer,
        flow: Flow.Out,
        details,
        transferGroupId,
        counterpartyId: input.toAccountId,
      },
    }),
    prisma.entry.create({
      data: {
        accountId: input.toAccountId,
        date,
        amountCents,
        type: EntryType.Transfer,
        flow: Flow.In,
        details,
        transferGroupId,
        counterpartyId: input.fromAccountId,
      },
    }),
  ]);

  return { transferGroupId, out, in: incoming };
}

export async function updateTransfer(
  groupId: string,
  input: UpdateTransferInput,
) {
  const rows = await prisma.entry.findMany({
    where: { transferGroupId: groupId },
  });
  if (rows.length === 0) {
    throw new ServiceError("Transfer not found.", 404);
  }
  const outRow = rows.find((r) => r.flow === Flow.Out);
  const inRow = rows.find((r) => r.flow === Flow.In);
  if (!outRow || !inRow) {
    throw new ServiceError("Transfer is malformed.", 500);
  }

  const from = input.fromAccountId ?? outRow.accountId;
  const to = input.toAccountId ?? inRow.accountId;
  if (from === to) {
    throw new ServiceError(
      "Source and destination must be different accounts.",
      400,
    );
  }
  if (input.fromAccountId) await assertAccount(from);
  if (input.toAccountId) await assertAccount(to);

  const amountCents =
    input.amountEuros !== undefined ? eurosToCents(input.amountEuros) : undefined;
  const date = input.date ? isoDateToUTC(input.date) : undefined;
  const shared = {
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(date ? { date } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
  };

  await prisma.$transaction([
    prisma.entry.update({
      where: { id: outRow.id },
      data: { accountId: from, counterpartyId: to, ...shared },
    }),
    prisma.entry.update({
      where: { id: inRow.id },
      data: { accountId: to, counterpartyId: from, ...shared },
    }),
  ]);

  return { transferGroupId: groupId };
}

export async function deleteTransfer(groupId: string) {
  const res = await prisma.entry.deleteMany({
    where: { transferGroupId: groupId },
  });
  if (res.count === 0) {
    throw new ServiceError("Transfer not found.", 404);
  }
}
