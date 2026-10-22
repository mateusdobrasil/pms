import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getStoreByDomain, productImageUrl } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { getInstallmentsInfo } from "@/lib/payments/installments";
import { AddToCart } from "./add-to-cart";
import { Gallery, type Media } from "./gallery";
import { productVideoUrl } from "@/lib/images";

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
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: { title: product.name, description, images: cover ? [productImageUrl(cover.path)] : undefined },
  };
}

export default async function ProductPage({ params }: Params) {
  const { domain, slug } = await params;
  const found = await getProduct(domain, slug);
  if (!found) notFound();
  const { product, store } = found;

  // Dados estruturados (schema.org/Product): o Google mostra preço e disponibilidade na busca.
  const prices = product.product_variants.map((v) => v.price_cents);
  const [installments, { data: videos }] = await Promise.all([
    getInstallmentsInfo(store.id, Math.min(...prices)),
    // Consulta à parte: sem a tabela de vídeos (SQL não rodado), o produto aparece só com as fotos.
    createPublicClient()
      .from("product_videos")
      .select("path")
      .eq("store_id", store.id)
      .eq("product_id", product.id)
      .order("position"),
  ]);
  const media: Media[] = [
    ...product.product_images.map((i) => ({ type: "image" as const, url: productImageUrl(i.path), alt: i.alt })),
    ...(videos ?? []).map((v) => ({ type: "video" as const, url: productVideoUrl(v.path), alt: null })),
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.product_images.map((i) => productImageUrl(i.path)),
    sku: product.id,
    brand: { "@type": "Brand", name: store.name },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: product.product_variants.length,
      availability: product.product_variants.some((v) => v.stock > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <script
        type="application/ld+json"
        // JSON.stringify não escapa "<"; troca para não fechar a tag script por engano.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll("<", String.fromCharCode(92) + "u003c") }}
      />
      <Gallery name={product.name} media={media} />

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
          installments={installments}
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
