import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { ProductGrid, fetchProducts } from "./product-grid";

export const revalidate = 60;

export default async function StoreHome({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const products = await fetchProducts(store.id, { limit: 24 });
  if (products.length === 0) return <p className="text-neutral-600">Nenhum produto cadastrado ainda.</p>;
  return <ProductGrid products={products} />;
}
