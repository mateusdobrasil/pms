import { notFound } from "next/navigation";
import { getCategories, getStoreByDomain } from "@/lib/store";
import { ProductGrid, fetchProducts } from "../../product-grid";

export const revalidate = 60;

type Params = { params: Promise<{ domain: string; slug: string }> };

async function load({ params }: Params) {
  const { domain, slug } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) return null;
  const category = (await getCategories(store.id)).find((c) => c.slug === decodeURIComponent(slug));
  return category ? { store, category } : null;
}

export async function generateMetadata(props: Params) {
  const found = await load(props);
  return { title: found?.category.name ?? "Categoria" };
}

export default async function CategoryPage(props: Params) {
  const found = await load(props);
  if (!found) notFound();
  const products = await fetchProducts(found.store.id, { categoryId: found.category.id });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{found.category.name}</h1>
      {products.length === 0 ? (
        <p className="text-neutral-600">Nenhum produto nesta categoria por enquanto.</p>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}
