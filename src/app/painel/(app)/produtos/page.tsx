import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { productImageUrl } from "@/lib/store";
import { isUuid } from "@/lib/validation";

const PAGE_SIZE = 30;

const FILTERS = [
  { label: "Todos", value: null },
  { label: "Visíveis", value: "visiveis" },
  { label: "Ocultos", value: "ocultos" },
  { label: "Destaques", value: "destaques" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

type Row = {
  id: string;
  name: string;
  active: boolean;
  featured: boolean;
  categories: { name: string } | null;
  product_variants: { price_cents: number; stock: number; active: boolean }[];
  product_images: { path: string; position: number }[];
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string; categoria?: string; page?: string }>;
}) {
  const { supabase, store } = await requireStore();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter = (FILTERS.find((f) => f.value === sp.filtro)?.value ?? null) as Filter;
  const category = sp.categoria && (sp.categoria === "sem" || isUuid(sp.categoria)) ? sp.categoria : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let query = supabase
    .from("products")
    .select("id, name, active, featured, categories(name), product_variants(price_cents, stock, active), product_images(path, position)", {
      count: "exact",
    })
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  if (filter === "visiveis") query = query.eq("active", true);
  if (filter === "ocultos") query = query.eq("active", false);
  if (filter === "destaques") query = query.eq("featured", true);
  if (category === "sem") query = query.is("category_id", null);
  else if (category) query = query.eq("category_id", category);

  const [{ data, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").eq("store_id", store.id).order("position").order("name"),
  ]);
  const products = (data ?? []) as unknown as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const filtered = !!(q || filter || category) || page > 1;

  const href = (params: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged = { q: q || null, filtro: filter, categoria: category, page: null, ...params };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") next.set(k, String(v));
    const s = next.toString();
    return s ? `/painel/produtos?${s}` : "/painel/produtos";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
        <div className="flex gap-2">
          <form action="/painel/produtos" className="flex gap-2">
            {filter && <input type="hidden" name="filtro" value={filter} />}
            {category && <input type="hidden" name="categoria" value={category} />}
            <input name="q" defaultValue={q} placeholder="Buscar produto" className="w-44 rounded-md border bg-white px-3 py-1.5 text-sm" />
          </form>
          <Link href="/painel/produtos/novo" className="rounded-md bg-primary-600 hover:bg-primary-700 px-4 py-1.5 text-sm font-medium text-white">
            Novo produto
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={href({ filtro: f.value })}
            className={`rounded-full border px-3 py-1 ${filter === f.value ? "border-primary-600 bg-primary-600 text-white" : "bg-white"}`}
          >
            {f.label}
          </Link>
        ))}
        {(categories ?? []).length > 0 && (
          <form action="/painel/produtos" className="ml-auto">
            {q && <input type="hidden" name="q" value={q} />}
            {filter && <input type="hidden" name="filtro" value={filter} />}
            <select
              name="categoria"
              defaultValue={category ?? ""}
              aria-label="Categoria"
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Todas as categorias</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="sem">Sem categoria</option>
            </select>
            <button type="submit" className="ml-2 rounded-md border bg-white px-3 py-1.5 text-sm">Filtrar</button>
          </form>
        )}
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border bg-white shadow-sm px-4 py-8 text-center text-neutral-500">
          {filtered ? "Nenhum produto encontrado." : "Nenhum produto cadastrado ainda."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
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

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })} className="font-medium text-primary-700 hover:underline">← Anteriores</Link> : <span />}
          <span className="text-neutral-500">Página {page} de {pages} · {count} produtos</span>
          {page < pages ? <Link href={href({ page: page + 1 })} className="font-medium text-primary-700 hover:underline">Próximos →</Link> : <span />}
        </div>
      )}
    </div>
  );
}
