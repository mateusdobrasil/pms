// Feed de produtos para o Google Merchant Center (aba Shopping, listagens gratuitas).
// Formato RSS 2.0 com o namespace g: (https://support.google.com/merchants/answer/7052112).
// Cada variação vira um item; variações do mesmo produto ficam agrupadas por item_group_id.

export type FeedProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  imageUrls: string[]; // a primeira é a principal
  variants: { id: string; name: string; priceCents: number; compareAtCents: number | null; stock: number }[];
};

export type FeedStore = { name: string; baseUrl: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// Remove caracteres de controle que deixariam o XML inválido.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

export const feedPrice = (cents: number) => `${(cents / 100).toFixed(2)} BRL`;

export function buildGoogleFeed(store: FeedStore, products: FeedProduct[]) {
  const items: string[] = [];
  for (const p of products) {
    if (!p.imageUrls.length || !p.variants.length) continue; // o Google exige imagem
    const single = p.variants.length === 1;
    const description = clean(p.description || p.name).slice(0, 5000);
    for (const v of p.variants) {
      const title = clean(single || v.name === "Único" ? p.name : `${p.name} - ${v.name}`).slice(0, 150);
      const onSale = v.compareAtCents != null && v.compareAtCents > v.priceCents;
      const fields = [
        ["g:id", v.id],
        ["g:item_group_id", single ? null : p.id],
        ["g:title", title],
        ["g:description", description],
        ["g:link", `${store.baseUrl}/p/${p.slug}`],
        ["g:image_link", p.imageUrls[0]],
        ...p.imageUrls.slice(1, 11).map((url) => ["g:additional_image_link", url]),
        ["g:availability", v.stock > 0 ? "in_stock" : "out_of_stock"],
        ["g:price", feedPrice(onSale ? v.compareAtCents! : v.priceCents)],
        ["g:sale_price", onSale ? feedPrice(v.priceCents) : null],
        ["g:condition", "new"],
        ["g:brand", store.name],
        ["g:identifier_exists", "no"], // lojas pequenas raramente têm GTIN/código de barras
        ["g:product_type", p.category],
      ] as [string, string | null][];
      items.push(
        `    <item>\n${fields
          .filter(([, value]) => value)
          .map(([tag, value]) => `      <${tag}>${esc(value!)}</${tag}>`)
          .join("\n")}\n    </item>`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(store.name)}</title>
    <link>${esc(store.baseUrl)}/</link>
    <description>Produtos de ${esc(store.name)}</description>
${items.join("\n")}
  </channel>
</rss>`;
}
