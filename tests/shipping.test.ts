import { describe, expect, it } from "vitest";
import { deliveryOptions, type MeQuote } from "@/lib/shipping";
import { parseShippingMode, shippingModeAllowsPickup, shippingModeUsesMelhorEnvio } from "@/lib/shipping-mode";

// Formato da resposta de /api/v2/me/shipment/calculate do Melhor Envio.
const quotes: MeQuote[] = [
  { id: 1, name: "PAC", custom_price: "18.40", custom_delivery_time: 8, company: { id: 1, name: "Correios" } },
  { id: 2, name: "SEDEX", custom_price: "32.90", custom_delivery_time: 3, company: { id: 1, name: "Correios" } },
  { id: 3, name: ".Package", custom_price: "15.10", custom_delivery_time: 6, company: { id: 2, name: "Jadlog" } },
  { id: 17, name: "Mini Envios", error: "Dimensões não atendidas", company: { id: 1, name: "Correios" } },
];

describe("forma de entrega da loja", () => {
  it("aceita só as quatro opções", () => {
    expect(parseShippingMode("pickup_correios")).toBe("pickup_correios");
    expect(parseShippingMode("me")).toBe("me");
    expect(parseShippingMode("correios")).toBeNull();
    expect(parseShippingMode(null)).toBeNull();
  });

  it("retirada some só em 'Somente Melhor Envio'; o Melhor Envio só fica de fora em 'Somente retirada'", () => {
    expect(shippingModeAllowsPickup("me")).toBe(false);
    expect(shippingModeAllowsPickup("pickup_correios")).toBe(true);
    expect(shippingModeUsesMelhorEnvio("pickup")).toBe(false);
    expect(shippingModeUsesMelhorEnvio("pickup_correios")).toBe(true);
  });
});

describe("cotações do Melhor Envio", () => {
  it("com Melhor Envio, mostra todas as transportadoras, da mais barata à mais cara, sem as que deram erro", () => {
    const options = deliveryOptions(quotes, "pickup_me");
    expect(options.map((o) => o.name)).toEqual(["Jadlog .Package", "Correios PAC", "Correios SEDEX"]);
    expect(options[1]).toMatchObject({ id: "me:1", priceCents: 1840, deliveryDays: 8, requiresAddress: true });
  });

  it("em 'Retirada ou Correios', mostra só PAC e SEDEX", () => {
    expect(deliveryOptions(quotes, "pickup_correios").map((o) => o.id)).toEqual(["me:1", "me:2"]);
  });

  it("reconhece os Correios pelo nome quando a cotação não traz o id da empresa", () => {
    const semId: MeQuote[] = [{ id: 1, name: "PAC", price: "20.00", company: { name: "Correios" } }];
    expect(deliveryOptions(semId, "pickup_correios")).toHaveLength(1);
  });
});
