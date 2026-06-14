import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/schemas/category";

export async function listCategories(includeArchived = false) {
  return prisma.category.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

// The @@unique([name, parentId, kind]) index does not catch duplicate
// top-level names, because Postgres treats NULL parentIds as distinct. Enforce
// it in the service, where Prisma's `parentId: null` filter means IS NULL.
async function assertUniqueName(
  name: string,
  kind: "Income" | "Expense",
  parentId: string | null,
  excludeId?: string,
) {
  const clash = await prisma.category.findFirst({
    where: {
      name,
      kind,
      parentId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (clash) {
    throw new ServiceError(
      "A category with that name already exists here.",
      409,
    );
  }
}

export async function createCategory(input: CreateCategoryInput) {
  let kind = input.kind;
  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      throw new ServiceError("Parent category not found.", 400);
    }
    if (parent.parentId) {
      throw new ServiceError(
        "Sub-categories can only be nested one level deep.",
        400,
      );
    }
    // A sub-category always inherits its parent's kind.
    kind = parent.kind;
  }

  await assertUniqueName(input.name, kind, parentId);

  return prisma.category.create({
    data: { name: input.name, kind, color: input.color ?? null, parentId },
  });
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  if (input.name !== undefined) {
    const current = await prisma.category.findUnique({ where: { id } });
    if (!current) throw new ServiceError("Category not found.", 404);
    await assertUniqueName(input.name, current.kind, current.parentId, id);
  }

  return prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
    },
  });
}

/** Delete a category only when nothing references it. */
export async function deleteCategory(id: string) {
  const [children, entries] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.entry.count({ where: { categoryId: id } }),
  ]);
  if (children > 0) {
    throw new ServiceError(
      "Cannot delete: this category has sub-categories. Delete or archive them first.",
      409,
    );
  }
  if (entries > 0) {
    throw new ServiceError(
      "Cannot delete: this category is used by existing entries. Archive it instead.",
      409,
    );
  }
  await prisma.category.delete({ where: { id } });
}
