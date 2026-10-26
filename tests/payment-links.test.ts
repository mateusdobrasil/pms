import { describe, expect, it } from "vitest";
import { isPaymentLink, linkState, linkStateLabel, validityLabel, whatsappShareText } from "@/lib/payment-links";

const now = new Date("2026-11-01T12:00:00Z");

describe("situação do link de pagamento", () => {
  it("ativo dentro da validade ou sem validade", () => {
    expect(linkState({ status: "active", expires_at: "2026-11-02T00:00:00Z" }, now)).toBe("active");
    expect(linkState({ status: "active", expires_at: null }, now)).toBe("active");
  });

  it("ativo que passou da validade é vencido", () => {
    expect(linkState({ status: "active", expires_at: "2026-11-01T11:59:59Z" }, now)).toBe("expired");
    expect(linkState({ status: "active", expires_at: "2026-11-01T12:00:00Z" }, now)).toBe("expired");
  });

  it("pago e cancelado não mudam com a validade", () => {
    expect(linkState({ status: "paid", expires_at: "2026-10-01T00:00:00Z" }, now)).toBe("paid");
    expect(linkState({ status: "canceled", expires_at: null }, now)).toBe("canceled");
  });

  it("rótulos", () => {
    expect(linkStateLabel("active")).toBe("Aguardando pagamento");
    expect(linkStateLabel("active", true)).toBe("Aberto");
    expect(linkStateLabel("expired", true)).toBe("Vencido");
    expect(validityLabel(0)).toBe("Sem validade");
    expect(validityLabel(1)).toBe("1 dia");
    expect(validityLabel(7)).toBe("7 dias");
  });
});

describe("pedido de link", () => {
  it("reconhece pela forma de entrega gravada", () => {
    expect(isPaymentLink("Link de pagamento")).toBe(true);
    expect(isPaymentLink("pickup")).toBe(false);
    expect(isPaymentLink(null)).toBe(false);
  });

  it("mensagem do WhatsApp leva o link", () => {
    const text = whatsappShareText("Loja X", "Vestido azul M", "R$ 150,00", "https://loja.com.br/pagar/abc");
    expect(text).toContain('"Vestido azul M" (R$ 150,00) na Loja X');
    expect(text.endsWith("https://loja.com.br/pagar/abc")).toBe(true);
  });
});
