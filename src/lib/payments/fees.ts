// Taxa do Mercado Pago e valor que o lojista de fato recebe, a partir do pagamento aprovado
// guardado em payments.raw (fee_details e transaction_details.net_received_amount).
// Testado em tests/fees.test.ts.

export type PaymentFees = { feeCents: number; netCents: number };

// Seleção pronta para o Supabase: só os dois campos do JSON, sem trazer o pagamento inteiro.
export const FEE_FIELDS = "fee:raw->fee_details, net:raw->transaction_details->net_received_amount";

type FeeDetail = { amount?: unknown; fee_payer?: unknown };

export function paymentFees(amountCents: number, feeDetails: unknown, netReceived: unknown): PaymentFees | null {
  // Taxas cobradas do lojista. Juros do parcelamento pagos pelo cliente (fee_payer "payer") não saem do valor dele.
  const fees = Array.isArray(feeDetails) ? (feeDetails as FeeDetail[]).filter((f) => f?.fee_payer !== "payer") : [];
  if (fees.length) {
    const feeCents = fees.reduce((sum, f) => sum + Math.round(Number(f.amount ?? 0) * 100), 0);
    return { feeCents, netCents: amountCents - feeCents };
  }
  // Sem detalhamento (ex.: Pix sem tarifa): o líquido informado pelo Mercado Pago define a taxa.
  if (typeof netReceived === "number") {
    const netCents = Math.round(netReceived * 100);
    return { feeCents: amountCents - netCents, netCents };
  }
  return null; // o Mercado Pago ainda não informou
}

// "2,99%" (taxa sobre o valor pago).
export function feePercent(fees: PaymentFees) {
  const total = fees.feeCents + fees.netCents;
  if (!total) return "0%";
  return `${((fees.feeCents / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
