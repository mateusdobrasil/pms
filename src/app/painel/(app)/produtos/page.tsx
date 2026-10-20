import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { productImageUrl } from "@/lib/store";

type Row = {
  id: string;
  name: string;
  active: boolean;
  featured: boolean;
  categories: { name: string } | null;
  product_variants: { price_cents: number; stock: number; active: boolean }[];
  product_images: { path: string; position: number }[];
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, store } = await requireStore();
  const q = ((await searchParams).q ?? "").trim();

  let query = supabase
    .from("products")
    .select("id, name, active, featured, categories(name), product_variants(price_cents, stock, active), product_images(path, position)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const { data } = await query;
  const products = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Produtos</h1>
        <div className="flex gap-2">
          <form action="/painel/produtos" className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Buscar produto" className="w-44 rounded-md border bg-white px-3 py-1.5 text-sm" />
          </form>
          <Link href="/painel/produtos/novo" className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white">
            Novo produto
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="rounded-md border bg-white px-4 py-8 text-center text-neutral-500">
          {q ? "Nenhum produto encontrado." : "Nenhum produto cadastrado ainda."}
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-white">
          {products.map((p) => {
            const variants = p.product_variants.filter((v) => v.active);
            const prices = variants.map((v) => v.price_cents);
            const min = prices.length ? Math.min(...prices) : null;
            const max = prices.length ? Math.max(...prices) : null;
            const stock = variants.reduce((s, v) => s + v.stock, 0);
            const cover = [...p.product_images].sort((a, b) => a.position - b.position)[0];

            return (
              <li key={p.id}>
                <Link href={`/painel/produtos/${p.id}`} className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-neutral-50">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-neutral-100">
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={productImageUrl(cover.path)} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {p.name}
                      {!p.active && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal">inativo</span>}
                      {p.featured && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal">destaque</span>}
                    </p>
                    <p className="text-neutral-500">
                      {p.categories?.name ?? "Sem categoria"} · {variants.length} variação(ões)
                    </p>
                  </div>
                  <div className="text-right">
                    <p>{min === null ? "—" : min === max ? formatBRL(min) : `${formatBRL(min)} – ${formatBRL(max!)}`}</p>
                    <p className={stock === 0 ? "text-red-700" : "text-neutral-500"}>
                      {stock === 0 ? "Sem estoque" : `${stock} em estoque`}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
