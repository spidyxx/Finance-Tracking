import { listCategories } from "@/services/categories";
import { CategoryForm } from "@/components/categories/category-form";
import { CategoryActions } from "@/components/categories/category-actions";
import { CategoryEditDialog } from "@/components/categories/category-edit-dialog";

export const dynamic = "force-dynamic";

type Category = Awaited<ReturnType<typeof listCategories>>[number];

export default async function CategoriesPage() {
  const categories = await listCategories(true);
  const formOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
    archived: c.archived,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Categories</h1>

      <CategoryForm categories={formOptions} />

      <div className="grid gap-6 md:grid-cols-2">
        <KindColumn title="Expenses" kind="Expense" categories={categories} />
        <KindColumn title="Income" kind="Income" categories={categories} />
      </div>
    </div>
  );
}

function KindColumn({
  title,
  kind,
  categories,
}: {
  title: string;
  kind: "Income" | "Expense";
  categories: Category[];
}) {
  const tops = categories.filter((c) => c.kind === kind && c.parentId === null);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-gray-500">{title}</h2>
      {tops.length === 0 ? (
        <p className="text-sm text-gray-400">No categories yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tops.map((top) => {
            const children = categories.filter((c) => c.parentId === top.id);
            return (
              <div
                key={top.id}
                className="rounded-lg border border-gray-200 bg-white"
              >
                <CategoryRow category={top} />
                {children.length > 0 && (
                  <div className="border-t border-gray-100">
                    {children.map((child) => (
                      <CategoryRow key={child.id} category={child} indented />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CategoryRow({
  category,
  indented = false,
}: {
  category: Category;
  indented?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between px-4 py-2.5" +
        (indented ? " pl-9" : "")
      }
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: category.color ?? "#d1d5db" }}
        />
        <span
          className={
            "truncate text-sm" +
            (category.archived ? " text-gray-400 line-through" : "")
          }
        >
          {category.name}
        </span>
        {category.archived && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
            archived
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <CategoryEditDialog
          id={category.id}
          name={category.name}
          color={category.color}
        />
        <CategoryActions id={category.id} archived={category.archived} />
      </div>
    </div>
  );
}
