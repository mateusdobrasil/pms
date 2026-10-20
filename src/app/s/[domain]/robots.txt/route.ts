import { storeBaseUrl } from "@/lib/urls";

// loja.com.br/robots.txt → /s/loja.com.br/robots.txt (proxy)
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const base = storeBaseUrl(decodeURIComponent(domain).toLowerCase());
  const body = [
    "User-agent: *",
    "Allow: /",
    // Páginas pessoais ou sem valor de busca.
    "Disallow: /carrinho",
    "Disallow: /checkout",
    "Disallow: /pedido/",
    "Disallow: /busca",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
