import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { ProductGrid, fetchProducts } from "../product-grid";

export const metadata = { title: "Busca", robots: { index: false } };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const products = q.length >= 2 ? await fetchProducts(store.id, { search: q }) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{q ? `Resultados para “${q}”` : "Buscar"}</h1>
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
