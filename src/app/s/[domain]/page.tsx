import { notFound } from "next/navigation";
import { getStoreByDomain, productImageUrl } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { formatBRL } from "@/lib/money";

type Row = {
  id: string;
  name: string;
  slug: string;
  product_variants: { price_cents: number }[];
  product_images: { path: string; position: number }[];
};

export const revalidate = 60;

export default async function StoreHome({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, slug, product_variants(price_cents), product_images(path, position)")
    .eq("store_id", store.id)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(24);

  const products = (data ?? []) as Row[];

  if (products.length === 0) {
    return <p className="text-neutral-600">Nenhum produto cadastrado ainda.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {products.map((p) => {
        const prices = p.product_variants.map((v) => v.price_cents);
        const minPrice = prices.length ? Math.min(...prices) : null;
        const cover = [...p.product_images].sort((a, b) => a.position - b.position)[0];

        return (
          <li key={p.id}>
            <a href={`/p/${p.slug}`} className="block">
              <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={productImageUrl(cover.path)} alt={p.name} className="h-full w-full object-cover" />
                )}
              </div>
              <p className="mt-2 text-sm">{p.name}</p>
              {minPrice !== null && (
                <p className="text-sm font-semibold">
                  {prices.length > 1 && new Set(prices).size > 1 ? "a partir de " : ""}
                  {formatBRL(minPrice)}
                </p>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
