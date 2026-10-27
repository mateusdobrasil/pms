import { describe, expect, it } from "vitest";
import { LEGACY_REMINDER_PARAMS, WA_EVENTS, WA_EVENT_KEYS, WA_SUGGESTIONS, bookingFields, buildParams, countPlaceholders, isWaEvent, orderFields, previewText } from "@/lib/whatsapp-events";

describe("eventos do WhatsApp", () => {
  it("conta as variáveis do template", () => {
    expect(countPlaceholders("Olá, {{1}}! Seu pedido {{2}} saiu. Rastreio: {{3}} .")).toBe(3);
    expect(countPlaceholders("Sem variáveis")).toBe(0);
    expect(countPlaceholders("{{2}} e {{1}} e {{2}}")).toBe(2);
  });

  it("monta os parâmetros na ordem, sem vazio nem quebra de linha", () => {
    expect(buildParams(["first_name", "tracking", "store_name"], { first_name: "Ana", store_name: "Loja\nX" })).toEqual(["Ana", "-", "Loja X"]);
  });

  it("prévia com os exemplos", () => {
    expect(previewText("Olá, {{1}}! Na {{2}} às {{3}}. {{4}}", ["first_name", "store_name", "time"])).toBe("Olá, Ana! Na Salão Exemplo às 14:00. {{4}}");
  });

  it("eventos conhecidos e dados de cada um", () => {
    expect(isWaEvent("order_paid")).toBe(true);
    expect(isWaEvent("qualquer")).toBe(false);
    expect(WA_EVENTS.order_shipped.fields).toContain("tracking");
    expect(WA_EVENTS.store_new_sale.audience).toBe("store");
  });

  it("sugestões válidas para a Meta: dados do próprio evento, uma variável por dado, sem variável nas pontas", () => {
    for (const ev of WA_EVENT_KEYS) {
      const s = WA_SUGGESTIONS[ev];
      expect(s.name, ev).toMatch(/^[a-z0-9_]+$/);
      expect(countPlaceholders(s.body), ev).toBe(s.params.length);
      for (const f of s.params) expect(WA_EVENTS[ev].fields, `${ev}: ${f}`).toContain(f);
      expect(s.body.trim(), ev).not.toMatch(/^\{\{|\}\}\W*$/);
    }
  });
});

describe("dados dos eventos", () => {
  it("agendamento: data por extenso e hora de Brasília", () => {
    const f = bookingFields({ customerName: "Ana Maria", storeName: "Salão X", serviceName: "Escova", professionalName: "Bia", startsAt: "2026-10-30T17:00:00Z", link: "https://x" });
    expect(f).toMatchObject({ first_name: "Ana", date: "sexta-feira, 30/10", time: "14:00", service: "Escova" });
  });

  it("lembrete antigo: mesmos parâmetros de antes (primeiro nome, loja, serviço, hora, profissional, link)", () => {
    const f = bookingFields({ customerName: "Ana Maria Souza", storeName: "Salão X", serviceName: "Escova", startsAt: "2026-10-31T17:00:00Z", professionalName: "Bia", link: "https://x.com/agendamento/abc" });
    expect(buildParams(LEGACY_REMINDER_PARAMS, f)).toEqual(["Ana", "Salão X", "Escova", "14:00", "Bia", "https://x.com/agendamento/abc"]);
  });

  it("pedido: valor e itens", () => {
    const f = orderFields({ customerName: "Bia Lima", storeName: "Loja", code: "ABC", totalCents: 12990, items: [{ name: "Camiseta", quantity: 2 }, { name: "Boné", quantity: 1 }], link: "https://x", tracking: "AA1BR" });
    expect(f).toMatchObject({ first_name: "Bia", total: "R$ 129,90", items: "2× Camiseta, 1× Boné", tracking: "AA1BR" });
  });
});
