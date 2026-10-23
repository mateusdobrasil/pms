import { requireStore } from "@/lib/panel";
import { moveCategory } from "./actions";
import { CreateCategoryForm, DeleteCategoryButton, RenameCategoryForm } from "./category-forms";

type Category = { id: string; name: string; slug: string; products: { count: number }[] };

export default async function CategoriesPage() {
  const { supabase, store } = await requireStore();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, products(count)")
    .eq("store_id", store.id)
    .order("position")
    .order("name");
  const categories = (data ?? []) as Category[];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
      <CreateCategoryForm />

      {categories.length === 0 ? (
        <p className="rounded-xl border bg-white shadow-sm px-4 py-8 text-center text-neutral-500">Nenhuma categoria ainda.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
          {categories.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <form action={moveCategory} className="flex flex-col">
                <input type="hidden" name="id" value={c.id} />
                <button name="direction" value="up" disabled={i === 0} className="leading-none disabled:opacity-20" aria-label="Subir">▲</button>
                <button name="direction" value="down" disabled={i === categories.length - 1} className="leading-none disabled:opacity-20" aria-label="Descer">▼</button>
              </form>
              <RenameCategoryForm id={c.id} name={c.name} />
              <span className="text-neutral-500">{c.products[0]?.count ?? 0} produto(s)</span>
              {(c.products[0]?.count ?? 0) > 0 ? (
                <span className="text-xs text-neutral-400" title="Mude a categoria dos produtos antes de excluir">não dá para excluir</span>
              ) : (
                <DeleteCategoryButton id={c.id} name={c.name} />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-neutral-500">
        Só dá para excluir uma categoria vazia. Se ela tem produtos (visíveis ou ocultos), mude a categoria deles em Produtos antes.
      </p>
    </div>
  );
}
