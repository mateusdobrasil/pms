import { describe, expect, it } from "vitest";
import { feePercent, paymentFees } from "@/lib/payments/fees";

describe("paymentFees", () => {
  it("taxa do lojista e valor líquido (dados reais de um pagamento de teste)", () => {
    const fees = paymentFees(7990, [{ type: "mercadopago_fee", amount: 2.39, fee_payer: "collector" }], 77.51);
    expect(fees).toEqual({ feeCents: 239, netCents: 7751 });
    expect(feePercent(fees!)).toBe("2,99%");
  });

  it("juros do parcelamento pagos pelo cliente não contam como taxa do lojista", () => {
    const fees = paymentFees(
      15980,
      [
        { type: "mercadopago_fee", amount: 4.78, fee_payer: "collector" },
        { type: "financing_fee", amount: 12.5, fee_payer: "payer" },
      ],
      155.02,
    );
    expect(fees).toEqual({ feeCents: 478, netCents: 15502 });
  });

  it("sem detalhamento, usa o líquido informado (Pix sem tarifa = taxa zero)", () => {
    expect(paymentFees(5000, [], 50)).toEqual({ feeCents: 0, netCents: 5000 });
    expect(paymentFees(5000, null, 49.5)).toEqual({ feeCents: 50, netCents: 4950 });
  });

  it("sem informação do Mercado Pago, não inventa valor", () => {
    expect(paymentFees(5000, null, null)).toBeNull();
    expect(paymentFees(5000, [], undefined)).toBeNull();
  });
});
