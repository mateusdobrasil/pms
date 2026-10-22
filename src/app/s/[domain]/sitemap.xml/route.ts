import { getCategories, getStoreByDomain } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { storeBaseUrl } from "@/lib/urls";

// Dinâmico (como o robots.txt): com revalidate, o Next tentava gerar a rota de forma estática e,
// sem saber os domínios, respondia 404 em produção. O cache fica na CDN, por 1 hora.
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// loja.com.br/sitemap.xml → /s/loja.com.br/sitemap.xml (proxy)
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) return new Response("Not found", { status: 404 });

  const base = storeBaseUrl(decodeURIComponent(domain).toLowerCase());
  const [categories, { data: products }] = await Promise.all([
    getCategories(store.id),
    createPublicClient()
      .from("products")
      .select("slug, created_at")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const urls = [
    { loc: `${base}/`, priority: "1.0" },
    ...categories.map((c) => ({ loc: `${base}/c/${c.slug}`, priority: "0.8" })),
    { loc: `${base}/trocas-e-devolucoes`, priority: "0.3" },
    { loc: `${base}/politica-de-privacidade`, priority: "0.3" },
    ...(products ?? []).map((p) => ({ loc: `${base}/p/${p.slug}`, priority: "0.9" })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
