import { describe, expect, it } from "vitest";
import { captureAction, cartState, parseCapture, reminderWindow } from "@/lib/abandoned-cart";

const V = "0b6f2c1e-8a4d-4c3b-9e2f-1a2b3c4d5e6f";
const now = Date.parse("2026-10-28T15:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

describe("carrinho abandonado", () => {
  it("aceita o que o checkout manda e limpa os dados", () => {
    expect(parseCapture({ email: " Ana@Email.com ", name: "  Ana   Souza ", phone: "+55 (11) 98765-4321", items: [{ variantId: V, quantity: 2 }], whatsappOptIn: true })).toEqual({
      email: "ana@email.com",
      name: "Ana Souza",
      phone: "11987654321",
      whatsappOptIn: true,
      items: [{ variantId: V, quantity: 2 }],
    });
    expect(parseCapture({ email: "ana@email.com", phone: "123", items: [{ variantId: V, quantity: 1 }] })?.phone).toBeNull();
  });

  it("recusa e-mail inválido, carrinho vazio e itens estranhos", () => {
    expect(parseCapture({ email: "ana", items: [{ variantId: V, quantity: 1 }] })).toBeNull();
    expect(parseCapture({ email: "ana@email.com", items: [] })).toBeNull();
    expect(parseCapture({ email: "ana@email.com", items: [{ variantId: "x", quantity: 1 }] })).toBeNull();
    expect(parseCapture({ email: "ana@email.com", items: [{ variantId: V, quantity: 0 }] })).toBeNull();
    expect(parseCapture({ email: "ana@email.com", items: [{ variantId: V, quantity: 1.5 }] })).toBeNull();
    expect(parseCapture(null)).toBeNull();
  });

  it("um lembrete por carrinho: mesmo carrinho mantém a trava; depois de 7 dias vale um novo", () => {
    const base = { notified_at: null, converted_at: null, opted_out_at: null };
    expect(captureAction(null, now)).toBe("insert");
    expect(captureAction(base, now)).toBe("update");
    expect(captureAction({ ...base, notified_at: daysAgo(1) }, now)).toBe("update");
    expect(captureAction({ ...base, notified_at: daysAgo(8) }, now)).toBe("renew");
    expect(captureAction({ ...base, converted_at: daysAgo(10) }, now)).toBe("renew");
    expect(captureAction({ ...base, opted_out_at: daysAgo(100) }, now)).toBe("skip");
  });

  it("janela: de 48 h a 1 h atrás", () => {
    expect(reminderWindow(now)).toEqual({ since: "2026-10-26T15:00:00.000Z", until: "2026-10-28T14:00:00.000Z" });
  });

  it("situação: comprou vence tudo; depois saiu, voltou, lembrado", () => {
    const base = { notified_at: null, converted_at: null, opted_out_at: null, recovered_at: null };
    expect(cartState(base)).toBe("waiting");
    expect(cartState({ ...base, notified_at: daysAgo(1) })).toBe("reminded");
    expect(cartState({ ...base, notified_at: daysAgo(1), recovered_at: daysAgo(0) })).toBe("recovered");
    expect(cartState({ ...base, notified_at: daysAgo(1), recovered_at: daysAgo(0), converted_at: daysAgo(0) })).toBe("converted");
    expect(cartState({ ...base, opted_out_at: daysAgo(0) })).toBe("opted_out");
  });
});
