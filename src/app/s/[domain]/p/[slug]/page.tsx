import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getStoreByDomain, productImageUrl } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { AddToCart } from "./add-to-cart";
import { Gallery } from "./gallery";

export const revalidate = 60;

type Params = { params: Promise<{ domain: string; slug: string }> };

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categories: { name: string; slug: string } | null;
  product_variants: {
    id: string;
    name: string;
    price_cents: number;
    compare_at_cents: number | null;
    stock: number;
    position: number;
  }[];
  product_images: { path: string; alt: string | null; position: number }[];
};

const getProduct = cache(async (domain: string, slug: string) => {
  const store = await getStoreByDomain(domain);
  if (!store) return null;
  const { data } = await createPublicClient()
    .from("products")
    .select(
      "id, name, slug, description, categories(name, slug), product_variants(id, name, price_cents, compare_at_cents, stock, position), product_images(path, alt, position)",
    )
    .eq("store_id", store.id)
    .eq("slug", decodeURIComponent(slug))
    .maybeSingle();
  const product = data as unknown as Product | null;
  if (!product || product.product_variants.length === 0) return null;
  product.product_variants.sort((a, b) => a.position - b.position);
  product.product_images.sort((a, b) => a.position - b.position);
  return { store, product };
});

export async function generateMetadata({ params }: Params) {
  const { domain, slug } = await params;
  const found = await getProduct(domain, slug);
  if (!found) return { title: "Produto não encontrado" };
  const { product } = found;
  const description = product.description?.slice(0, 160) ?? undefined;
  const cover = product.product_images[0];
  return {
    title: product.name,
    description,
    openGraph: { title: product.name, description, images: cover ? [productImageUrl(cover.path)] : undefined },
  };
}

export default async function ProductPage({ params }: Params) {
  const { domain, slug } = await params;
  const found = await getProduct(domain, slug);
  if (!found) notFound();
  const { product } = found;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Gallery name={product.name} images={product.product_images.map((i) => ({ url: productImageUrl(i.path), alt: i.alt }))} />

      <div className="space-y-6">
        <div>
          {product.categories && (
            <Link href={`/c/${product.categories.slug}`} className="text-sm text-neutral-500 hover:underline">
              {product.categories.name}
            </Link>
          )}
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{product.name}</h1>
        </div>

        <AddToCart
          productName={product.name}
          variants={product.product_variants.map((v) => ({
            id: v.id,
            name: v.name,
            priceCents: v.price_cents,
            compareAtCents: v.compare_at_cents,
            stock: v.stock,
          }))}
        />

        {product.description && (
          <div className="whitespace-pre-line border-t pt-6 text-sm leading-relaxed text-neutral-700">{product.description}</div>
        )}
      </div>
    </div>
  );
}
