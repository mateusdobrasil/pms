import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { ProductGrid, fetchProducts } from "../product-grid";
import { parseSort } from "../sort-options";
import { SortSelect } from "../sort-select";

export const metadata = { title: "Busca", robots: { index: false } };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ q?: string; ordem?: string }>;
}) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const sort = parseSort(sp.ordem);
  const products = q.length >= 2 ? await fetchProducts(store.id, { search: q, sort }) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{q ? `Resultados para “${q}”` : "Buscar"}</h1>
        {products.length > 1 && <SortSelect value={sort} />}
      </div>
      {q.length < 2 ? (
        <p className="text-neutral-600">Digite pelo menos 2 letras na busca.</p>
      ) : products.length === 0 ? (
        <p className="text-neutral-600">Nenhum produto encontrado.</p>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}
