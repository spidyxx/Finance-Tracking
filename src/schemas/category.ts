import { z } from "zod";

// Matches the Prisma CategoryKind enum's TS values, so no mapping is needed.
export const categoryKindSchema = z.enum(["Income", "Expense"]);

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #RRGGBB hex value");

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  kind: categoryKindSchema,
  color: hexColor.nullish(),
  // When set, this becomes a sub-category; its kind is inherited from the parent.
  parentId: z.string().uuid().nullish(),
});

// kind and parentId are immutable after creation (changing them would break
// existing entries / the one-level hierarchy).
export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60).optional(),
    color: hexColor.nullish(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
