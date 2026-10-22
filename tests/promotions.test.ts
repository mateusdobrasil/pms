import { describe, expect, it } from "vitest";
import { pixDiscountCents } from "@/lib/promotions";
import { applyFreeShipping, type ShippingOption } from "@/lib/shipping";
import { parseCartItems } from "@/lib/orders";

describe("desconto no Pix", () => {
  it("calcula sobre o subtotal, em centavos inteiros (para baixo)", () => {
    expect(pixDiscountCents(7990, 10)).toBe(799);
    expect(pixDiscountCents(7999, 5)).toBe(399); // 399,95 → 399
    expect(pixDiscountCents(100, 30)).toBe(30);
  });

  it("sem percentual, sem desconto", () => {
    expect(pixDiscountCents(7990, 0)).toBe(0);
  });
});

describe("frete grátis", () => {
  const option = (id: string, priceCents: number): ShippingOption => ({
    id,
    name: id,
    priceCents,
    deliveryDays: 3,
    requiresAddress: true,
  });
  const delivery = [option("me:pac", 1048), option("me:sedex", 2290)];

  it("zera só a opção mais barata quando o subtotal atinge o mínimo", () => {
    const result = applyFreeShipping(delivery, 5000, 5000);
    expect(result[0]).toMatchObject({ id: "me:pac", priceCents: 0, originalPriceCents: 1048 });
    expect(result[1]).toMatchObject({ id: "me:sedex", priceCents: 2290 });
  });

  it("não muda nada abaixo do mínimo ou sem promoção", () => {
    expect(applyFreeShipping(delivery, 4999, 5000)).toEqual(delivery);
    expect(applyFreeShipping(delivery, 99999, null)).toEqual(delivery);
  });

  it("não altera a lista original", () => {
    applyFreeShipping(delivery, 5000, 5000);
    expect(delivery[0].priceCents).toBe(1048);
  });
});

describe("carrinho vindo do navegador", () => {
  const A = "d33591ca-0c90-4f18-a082-e2f5a638aedb";
  const B = "8896c05c-d008-4944-bcb4-73d31a2f729c";

  it("soma linhas repetidas da mesma variação", () => {
    expect(parseCartItems([{ variantId: A, quantity: 1 }, { variantId: A, quantity: 2 }, { variantId: B, quantity: 1 }])).toEqual([
      { variantId: A, quantity: 3 },
      { variantId: B, quantity: 1 },
    ]);
  });

  it("limita a quantidade por variação", () => {
    expect(parseCartItems([{ variantId: A, quantity: 500 }])).toEqual([{ variantId: A, quantity: 99 }]);
  });

  it("recusa carrinho vazio, id inválido ou quantidade inválida", () => {
    expect(parseCartItems([])).toBeNull();
    expect(parseCartItems("x")).toBeNull();
    expect(parseCartItems([{ variantId: "1", quantity: 1 }])).toBeNull();
    expect(parseCartItems([{ variantId: A, quantity: 0 }])).toBeNull();
    expect(parseCartItems([{ variantId: A, quantity: 1.5 }])).toBeNull();
  });
});
