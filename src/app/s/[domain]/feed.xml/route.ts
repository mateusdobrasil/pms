import { getStoreByDomain, productImageUrl } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { storeBaseUrl } from "@/lib/urls";
import { buildGoogleFeed, type FeedProduct } from "@/lib/google-feed";

// Dinâmico, como o sitemap (rota com nome de arquivo + domínio variável); cache de 1 h na CDN.
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categories: { name: string } | null;
  product_images: { path: string; position: number }[];
  product_variants: { id: string; name: string; price_cents: number; compare_at_cents: number | null; stock: number; position: number }[];
};

// loja.com.br/feed.xml → /s/loja.com.br/feed.xml (proxy). Endereço para cadastrar no Google Merchant Center.
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) return new Response("Not found", { status: 404 });

  // O RLS já esconde produtos/variações inativos e lojas suspensas; filtramos store_id mesmo assim.
  const { data } = await createPublicClient()
    .from("products")
    .select(
      "id, name, slug, description, categories(name), product_images(path, position), product_variants(id, name, price_cents, compare_at_cents, stock, position)",
    )
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(5000);

  const products: FeedProduct[] = ((data ?? []) as unknown as Row[]).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: p.categories?.name ?? null,
    imageUrls: [...p.product_images].sort((a, b) => a.position - b.position).map((i) => productImageUrl(i.path)),
    variants: [...p.product_variants]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({ id: v.id, name: v.name, priceCents: v.price_cents, compareAtCents: v.compare_at_cents, stock: v.stock })),
  }));

  const xml = buildGoogleFeed({ name: store.name, baseUrl: storeBaseUrl(decodeURIComponent(domain).toLowerCase()) }, products);
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
