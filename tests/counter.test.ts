import { describe, expect, it } from "vitest";
import { cashSummary, changeFor, counterTotal, isCounterPayment, isCounterSale } from "@/lib/counter";

describe("venda no balcão", () => {
  it("desconto não passa do subtotal nem fica negativo", () => {
    expect(counterTotal(10000, 1500)).toEqual({ discountCents: 1500, totalCents: 8500 });
    expect(counterTotal(10000, 20000)).toEqual({ discountCents: 10000, totalCents: 0 });
    expect(counterTotal(10000, -50)).toEqual({ discountCents: 0, totalCents: 10000 });
  });

  it("troco", () => {
    expect(changeFor(8500, 10000)).toBe(1500);
    expect(changeFor(8500, 8500)).toBe(0);
    expect(changeFor(8500, 5000)).toBeNull();
  });

  it("forma de pagamento e venda de balcão", () => {
    expect(isCounterPayment("cash")).toBe(true);
    expect(isCounterPayment("boleto")).toBe(false);
    expect(isCounterSale("Venda no balcão")).toBe(true);
    expect(isCounterSale("pickup")).toBe(false);
  });

  it("caixa do dia por forma de pagamento, na ordem fixa", () => {
    const s = cashSummary([
      { counter_payment: "pix", total_cents: 3000 },
      { counter_payment: "cash", total_cents: 5000 },
      { counter_payment: "pix", total_cents: 2000 },
    ]);
    expect(s).toEqual({
      totalCents: 10000,
      count: 3,
      methods: [
        { method: "cash", label: "Dinheiro", count: 1, cents: 5000 },
        { method: "pix", label: "Pix", count: 2, cents: 5000 },
      ],
    });
  });
});
