import { describe, expect, it } from "vitest";
import { buildGoogleFeed, feedPrice, type FeedProduct } from "@/lib/google-feed";

const store = { name: "Loja & Cia", baseUrl: "https://www.loja.com.br" };
const base: FeedProduct = {
  id: "p1",
  name: "Camiseta básica",
  slug: "camiseta-basica",
  description: "Algodão <100%>",
  category: "Camisetas",
  imageUrls: ["https://img/1.webp", "https://img/2.webp"],
  variants: [
    { id: "v1", name: "P", priceCents: 7990, compareAtCents: 9990, stock: 3 },
    { id: "v2", name: "M", priceCents: 7990, compareAtCents: null, stock: 0 },
  ],
};

describe("feed do Google Shopping", () => {
  it("preço no formato do Google", () => {
    expect(feedPrice(7990)).toBe("79.90 BRL");
    expect(feedPrice(5)).toBe("0.05 BRL");
  });

  it("uma entrada por variação, agrupadas pelo produto", () => {
    const xml = buildGoogleFeed(store, [base]);
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("<g:item_group_id>p1</g:item_group_id>");
    expect(xml).toContain("<g:title>Camiseta básica - P</g:title>");
    expect(xml).toContain("<g:link>https://www.loja.com.br/p/camiseta-basica</g:link>");
    expect(xml).toContain("<g:additional_image_link>https://img/2.webp</g:additional_image_link>");
  });

  it("promoção vira price (de) + sale_price (por); estoque vira disponibilidade", () => {
    const xml = buildGoogleFeed(store, [base]);
    const [p, m] = xml.split("<item>").slice(1);
    expect(p).toContain("<g:price>99.90 BRL</g:price>");
    expect(p).toContain("<g:sale_price>79.90 BRL</g:sale_price>");
    expect(p).toContain("<g:availability>in_stock</g:availability>");
    expect(m).toContain("<g:price>79.90 BRL</g:price>");
    expect(m).not.toContain("sale_price");
    expect(m).toContain("<g:availability>out_of_stock</g:availability>");
  });

  it("escapa caracteres especiais do XML", () => {
    const xml = buildGoogleFeed(store, [base]);
    expect(xml).toContain("<g:brand>Loja &amp; Cia</g:brand>");
    expect(xml).toContain("Algodão &lt;100%&gt;");
  });

  it("produto de variação única não leva item_group_id nem o nome da variação", () => {
    const xml = buildGoogleFeed(store, [{ ...base, variants: [{ id: "v9", name: "Único", priceCents: 1000, compareAtCents: null, stock: 1 }] }]);
    expect(xml).not.toContain("item_group_id");
    expect(xml).toContain("<g:title>Camiseta básica</g:title>");
  });

  it("produto sem foto fica de fora (o Google exige imagem)", () => {
    expect(buildGoogleFeed(store, [{ ...base, imageUrls: [] }])).not.toContain("<item>");
  });
});

import { parseVerificationCode } from "@/lib/store-marketing";

describe("código de verificação do Google", () => {
  it("aceita a etiqueta inteira ou só o código", () => {
    expect(parseVerificationCode('<meta name="google-site-verification" content="abcDEF123_-xyz456" />')).toBe("abcDEF123_-xyz456");
    expect(parseVerificationCode("abcDEF123_-xyz456")).toBe("abcDEF123_-xyz456");
  });

  it("recusa o que não é código", () => {
    expect(parseVerificationCode("<script>alert(1)</script>")).toBeNull();
    expect(parseVerificationCode("curto")).toBeNull();
  });
});
