import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const createTransferSchema = z
  .object({
    date: isoDate,
    amountEuros: z.number().positive("Amount must be greater than 0"),
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    details: z.string().trim().max(500).optional().default(""),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Source and destination must be different accounts",
    path: ["toAccountId"],
  });

// Cross-field from≠to is re-checked in the service after merging with current
// values, since both ids are optional here.
export const updateTransferSchema = z
  .object({
    date: isoDate.optional(),
    amountEuros: z.number().positive().optional(),
    fromAccountId: z.string().uuid().optional(),
    toAccountId: z.string().uuid().optional(),
    details: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;
