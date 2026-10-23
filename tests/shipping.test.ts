import { describe, expect, it } from "vitest";
import { combineShipping, deliveryOptions, type MeQuote, type ShippingOption } from "@/lib/shipping";
import {
  LOCAL_DELIVERY_NAME,
  findLocalArea,
  parseCarriers,
  parseLocalAreas,
  shippingNeedsZip,
  type LocalArea,
} from "@/lib/shipping-settings";
import { statusLabel } from "@/lib/order-status";

// Formato da resposta de /api/v2/me/shipment/calculate do Melhor Envio.
const quotes: MeQuote[] = [
  { id: 1, name: "PAC", custom_price: "18.40", custom_delivery_time: 8, company: { id: 1, name: "Correios" } },
  { id: 2, name: "SEDEX", custom_price: "32.90", custom_delivery_time: 3, company: { id: 1, name: "Correios" } },
  { id: 3, name: ".Package", custom_price: "15.10", custom_delivery_time: 6, company: { id: 2, name: "Jadlog" } },
  { id: 17, name: "Mini Envios", error: "Dimensões não atendidas", company: { id: 1, name: "Correios" } },
];

describe("cotações do Melhor Envio", () => {
  it("com todas as transportadoras: da mais barata à mais cara, sem as que deram erro", () => {
    const options = deliveryOptions(quotes, "all");
    expect(options.map((o) => o.name)).toEqual(["Jadlog .Package", "Correios PAC", "Correios SEDEX"]);
    expect(options[1]).toMatchObject({ id: "me:1", priceCents: 1840, deliveryDays: 8, requiresAddress: true });
  });

  it("em 'Só Correios', mostra só PAC e SEDEX", () => {
    expect(deliveryOptions(quotes, "correios").map((o) => o.id)).toEqual(["me:1", "me:2"]);
  });

  it("reconhece os Correios pelo nome quando a cotação não traz o id da empresa", () => {
    const semId: MeQuote[] = [{ id: 1, name: "PAC", price: "20.00", company: { name: "Correios" } }];
    expect(deliveryOptions(semId, "correios")).toHaveLength(1);
  });

  it("sem transportadoras, nenhuma opção", () => {
    expect(deliveryOptions(quotes, "none")).toEqual([]);
    expect(parseCarriers("correios")).toBe("correios");
    expect(parseCarriers("pickup_me")).toBeNull();
  });
});

describe("entrega própria", () => {
  const areas: LocalArea[] = [
    { city: "São Paulo", state: "SP", priceCents: 1000, deliveryDays: 1 },
    { city: "Guarulhos", state: "SP", priceCents: 1500, deliveryDays: null },
  ];

  it("acha a cidade do CEP ignorando acentos e maiúsculas, e confere a UF", () => {
    expect(findLocalArea(areas, "SAO PAULO", "sp")?.priceCents).toBe(1000);
    expect(findLocalArea(areas, "  são   paulo ", "SP")).not.toBeNull();
    expect(findLocalArea(areas, "Guarulhos", "RJ")).toBeNull();
    expect(findLocalArea(areas, "Osasco", "SP")).toBeNull();
  });

  it("lê as cidades do formulário: preço em reais, vazio = grátis, linhas vazias ignoradas", () => {
    const { areas: parsed, error } = parseLocalAreas(
      JSON.stringify([
        { city: "São Paulo", state: "sp", price: "10,00", days: "1" },
        { city: "", state: "", price: "", days: "" },
        { city: "Guarulhos", state: "SP", price: "", days: "" },
      ]),
    );
    expect(error).toBeUndefined();
    expect(parsed).toEqual([
      { city: "São Paulo", state: "SP", priceCents: 1000, deliveryDays: 1 },
      { city: "Guarulhos", state: "SP", priceCents: 0, deliveryDays: null },
    ]);
  });

  it("recusa UF inválida, preço inválido e cidade repetida", () => {
    expect(parseLocalAreas(JSON.stringify([{ city: "Santos", state: "XX", price: "5" }])).error).toMatch(/UF inválida/);
    expect(parseLocalAreas(JSON.stringify([{ city: "Santos", state: "SP", price: "abc" }])).error).toMatch(/preço inválido/);
    const dup = [
      { city: "São Paulo", state: "SP", price: "10" },
      { city: "SAO PAULO", state: "SP", price: "12" },
    ];
    expect(parseLocalAreas(JSON.stringify(dup)).error).toMatch(/duas vezes/);
  });

  it("o checkout só pede CEP se houver entrega na casa do cliente", () => {
    expect(shippingNeedsZip({ carriers: "none", localDelivery: false })).toBe(false);
    expect(shippingNeedsZip({ carriers: "none", localDelivery: true })).toBe(true);
    expect(shippingNeedsZip({ carriers: "correios", localDelivery: false })).toBe(true);
  });

  it("no pedido, 'enviado' vira 'saiu para entrega'", () => {
    expect(statusLabel("shipped", LOCAL_DELIVERY_NAME)).toBe("Saiu para entrega");
    expect(statusLabel("delivered", LOCAL_DELIVERY_NAME)).toBe("Entregue");
    expect(statusLabel("shipped", "Correios PAC")).toBe("Enviado");
  });
});

describe("combinação das formas de entrega", () => {
  const local: ShippingOption = { id: "local", name: LOCAL_DELIVERY_NAME, priceCents: 1000, deliveryDays: 1, requiresAddress: true };
  const pac: ShippingOption = { id: "me:1", name: "Correios PAC", priceCents: 1840, deliveryDays: 8, requiresAddress: true };
  const ids = (q: { options: ShippingOption[] }) => q.options.map((o) => o.id);

  it("junta entrega própria e transportadoras pelo preço, com a retirada no fim", () => {
    const q = combineShipping({ pickup: true, carriers: "all" }, { status: "ok", options: [pac] }, { status: "ok", option: local }, 5000, null);
    expect(ids(q)).toEqual(["local", "me:1", "pickup"]);
    expect(q.error).toBeNull();
  });

  it("frete grátis vale para a opção mais barata, mesmo que seja a entrega própria", () => {
    const q = combineShipping({ pickup: false, carriers: "all" }, { status: "ok", options: [pac] }, { status: "ok", option: local }, 20000, 15000);
    expect(q.options[0]).toMatchObject({ id: "local", priceCents: 0, originalPriceCents: 1000 });
    expect(q.options[1].priceCents).toBe(1840);
  });

  it("somente entrega própria, fora da região: diz onde a loja entrega", () => {
    const q = combineShipping({ pickup: false, carriers: "none" }, { status: "off" }, { status: "outside", cities: ["São Paulo/SP"] }, 5000, null);
    expect(q.options).toEqual([]);
    expect(q.error).toBe("A loja não entrega neste CEP. A loja entrega em São Paulo/SP. Confira o CEP.");
  });

  it("fora da região com retirada: sugere a retirada", () => {
    const q = combineShipping({ pickup: true, carriers: "none" }, { status: "off" }, { status: "outside", cities: ["São Paulo/SP"] }, 5000, null);
    expect(ids(q)).toEqual(["pickup"]);
    expect(q.error).toMatch(/ou escolha a retirada\.$/);
  });

  it("Melhor Envio fora do ar não esconde a entrega própria", () => {
    const q = combineShipping({ pickup: true, carriers: "all" }, { status: "failed" }, { status: "ok", option: local }, 5000, null);
    expect(ids(q)).toEqual(["local", "pickup"]);
    expect(q.error).toMatch(/transportadoras/);
  });

  it("Só Correios sem atendimento no CEP", () => {
    const q = combineShipping({ pickup: true, carriers: "correios" }, { status: "ok", options: [] }, { status: "off" }, 5000, null);
    expect(q.error).toBe("Os Correios não entregam neste CEP. Confira o CEP ou escolha a retirada.");
  });

  it("loja sem Melhor Envio configurado e sem retirada: avisa que a entrega não está disponível", () => {
    const q = combineShipping({ pickup: false, carriers: "all" }, { status: "unavailable" }, { status: "off" }, 5000, null);
    expect(q.options).toEqual([]);
    expect(q.error).toMatch(/ainda não está disponível/);
  });
});
