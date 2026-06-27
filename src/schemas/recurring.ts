import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const frequencySchema = z.enum(["Weekly", "Monthly", "Yearly"]);
export const ruleTypeSchema = z.enum(["Income", "Expense", "Transfer"]);

export const createRecurringSchema = z.object({
  type: ruleTypeSchema,
  amountEuros: z.number().positive("Amount must be greater than 0"),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullish(), // required for income/expense
  counterpartyId: z.string().uuid().nullish(), // destination, required for transfer
  details: z.string().trim().max(500).optional().default(""),
  frequency: frequencySchema,
  interval: z.number().int().min(1).max(99).default(1),
  dayOfMonth: z.number().int().min(1).max(31).nullish(),
  endOfMonth: z.boolean().optional().default(false),
  startDate: isoDate,
  endDate: isoDate.nullish(),
});

// `type` is immutable after creation (changing income/expense/transfer would
// change the generated rows' shape). Schedule changes recompute nextRunDate.
export const updateRecurringSchema = z
  .object({
    amountEuros: z.number().positive().optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().nullish(),
    counterpartyId: z.string().uuid().nullish(),
    details: z.string().trim().max(500).optional(),
    frequency: frequencySchema.optional(),
    interval: z.number().int().min(1).max(99).optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    endOfMonth: z.boolean().optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.nullish(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;
