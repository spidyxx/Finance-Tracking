import { z } from "zod";

// Income/Expense only — transfers are created via the transfer endpoint.
export const entryTypeSchema = z.enum(["Income", "Expense"]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const createEntrySchema = z.object({
  date: isoDate,
  amountEuros: z.number().positive("Amount must be greater than 0"),
  type: entryTypeSchema,
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  details: z.string().trim().max(500).optional().default(""),
});

export const updateEntrySchema = z
  .object({
    date: isoDate.optional(),
    amountEuros: z.number().positive().optional(),
    type: entryTypeSchema.optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    details: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

// Query filters for the entries list (values arrive as strings).
export const entryFilterSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(["Income", "Expense", "Transfer"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type EntryFilter = z.infer<typeof entryFilterSchema>;
