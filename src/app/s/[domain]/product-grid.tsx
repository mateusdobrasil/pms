import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { ThumbImage } from "@/lib/thumb-image";
import { formatBRL } from "@/lib/money";
import { NoPhoto } from "./no-photo";
import type { Sort } from "./sort-options";
import { LOW_STOCK } from "@/lib/stock";
import { searchTerms } from "@/lib/search";

type Row = {
  id: string;
  name: string;
  slug: string;
  product_variants: { price_cents: number; compare_at_cents: number | null; stock: number }[];
  product_images: { path: string; position: number }[];
};

type Filter = { categoryId?: string; search?: string; limit?: number; sort?: Sort };

const minPrice = (p: Row) => Math.min(...p.product_variants.map((v) => v.price_cents));
const soldOut = (p: Row) => p.product_variants.every((v) => v.stock <= 0);

// Produtos ativos da loja (o RLS já esconde inativos e lojas suspensas; filtramos store_id mesmo assim).
// Preço e estoque estão nas variações, então a ordenação por preço é feita aqui (lojas pequenas: até 200 produtos).
export async function fetchProducts(storeId: string, { categoryId, search, limit = 48, sort = "destaques" }: Filter = {}) {
  const build = (accentless: boolean) => {
    let query = createPublicClient()
      .from("products")
      .select("id, name, slug, product_variants(price_cents, compare_at_cents, stock), product_images(path, position)")
      .eq("store_id", storeId);
    if (sort === "destaques") query = query.order("featured", { ascending: false });
    query = query.order("created_at", { ascending: false }).limit(200);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (search && accentless) for (const term of searchTerms(search)) query = query.ilike("search_name", `%${term}%`);
    else if (search) query = query.ilike("name", `%${search.replace(/[%_\\]/g, "")}%`);
    return query;
  };
  const first = await build(true);
  // Sem o SQL 20261025000000 a coluna search_name não existe: busca simples pelo nome.
  const { data } = first.error && search ? await build(false) : first;
  // Produto sem variação ativa não pode ser comprado: fica fora da vitrine.
  const rows = ((data ?? []) as Row[]).filter((p) => p.product_variants.length > 0);
  if (sort === "menor-preco") rows.sort((a, b) => minPrice(a) - minPrice(b));
  if (sort === "maior-preco") rows.sort((a, b) => minPrice(b) - minPrice(a));
  // Esgotados vão para o fim (sort é estável: mantém a ordem escolhida entre os demais).
  rows.sort((a, b) => Number(soldOut(a)) - Number(soldOut(b)));
  return rows.slice(0, limit);
}

export function ProductGrid({ products }: { products: Row[] }) {
  return (
    <ul className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {products.map((p) => {
        const prices = p.product_variants.map((v) => v.price_cents);
        const minPrice = Math.min(...prices);
        const cheapest = p.product_variants.find((v) => v.price_cents === minPrice);
        const soldOut = p.product_variants.every((v) => v.stock <= 0);
        const lastUnits = !soldOut && p.product_variants.reduce((s, v) => s + Math.max(0, v.stock), 0) <= LOW_STOCK;
        const cover = [...p.product_images].sort((a, b) => a.position - b.position)[0];

        return (
          <li key={p.id}>
            <Link href={`/p/${p.slug}`} className="group block">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200 transition group-hover:shadow-md">
                {cover ? (
                  <ThumbImage
                    path={cover.path}
                    alt={p.name}
                    lazy
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <NoPhoto />
                )}
                {soldOut && (
                  <span className="absolute left-2 top-2 rounded-full bg-neutral-900/80 px-2.5 py-0.5 text-xs font-medium text-white">Esgotado</span>
                )}
                {lastUnits && (
                  <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white">Últimas unidades</span>
                )}
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-medium text-neutral-800">{p.name}</p>
              <p className="mt-1 text-sm">
                {new Set(prices).size > 1 && <span className="text-neutral-500">a partir de </span>}
                <span className="text-base font-bold">{formatBRL(minPrice)}</span>
                {cheapest?.compare_at_cents && new Set(prices).size === 1 && (
                  <span className="ml-2 text-neutral-400 line-through">{formatBRL(cheapest.compare_at_cents)}</span>
                )}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

