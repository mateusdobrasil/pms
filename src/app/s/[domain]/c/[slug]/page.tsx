import { notFound } from "next/navigation";
import { getCategories, getStoreByDomain } from "@/lib/store";
import { ProductGrid, fetchProducts } from "../../product-grid";
import { parseSort } from "../../sort-options";
import { SortSelect } from "../../sort-select";

type Params = { params: Promise<{ domain: string; slug: string }>; searchParams: Promise<{ ordem?: string }> };

async function load({ params }: Params) {
  const { domain, slug } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) return null;
  const category = (await getCategories(store.id)).find((c) => c.slug === decodeURIComponent(slug));
  return category ? { store, category } : null;
}

export async function generateMetadata(props: Params) {
  const found = await load(props);
  return found
    ? { title: found.category.name, alternates: { canonical: `/c/${found.category.slug}` } }
    : { title: "Categoria" };
}

export default async function CategoryPage(props: Params) {
  const found = await load(props);
  if (!found) notFound();
  const sort = parseSort((await props.searchParams).ordem);
  const products = await fetchProducts(found.store.id, { categoryId: found.category.id, sort });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{found.category.name}</h1>
        {products.length > 1 && <SortSelect value={sort} />}
      </div>
      {products.length === 0 ? (
        <p className="text-neutral-600">Nenhum produto nesta categoria por enquanto.</p>
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}
