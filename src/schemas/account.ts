import { z } from "zod";

// Forms/clients submit the opening balance in euros; the service converts to
// integer cents for storage.
export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  openingEuros: z.number().finite().default(0),
});

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100).optional(),
    openingEuros: z.number().finite().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "No fields to update",
  });

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
