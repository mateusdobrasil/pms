// Venda no balcão (Painel → Vender). Funções puras, testadas em tests/counter.test.ts.

// Nome gravado em orders.shipping_method nas vendas de balcão (aparece assim no pedido e na planilha).
export const COUNTER_METHOD = "Venda no balcão";
export const isCounterSale = (shippingMethod: string | null | undefined) => shippingMethod === COUNTER_METHOD;

export type CounterPayment = "cash" | "pix" | "credit" | "debit" | "other";
export const COUNTER_PAYMENTS: Record<CounterPayment, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit: "Cartão de crédito",
  debit: "Cartão de débito",
  other: "Outro",
};
export const isCounterPayment = (v: unknown): v is CounterPayment => typeof v === "string" && v in COUNTER_PAYMENTS;

// Total da venda com desconto (o desconto nunca passa do subtotal).
export function counterTotal(subtotalCents: number, discountCents: number) {
  const discount = Math.min(Math.max(0, discountCents), subtotalCents);
  return { discountCents: discount, totalCents: subtotalCents - discount };
}

// Troco no dinheiro (null se o valor recebido não cobre o total).
export const changeFor = (totalCents: number, receivedCents: number) => (receivedCents >= totalCents ? receivedCents - totalCents : null);

// Caixa do dia: total por forma de pagamento.
export function cashSummary(sales: { counter_payment: CounterPayment; total_cents: number }[]) {
  const byMethod = new Map<CounterPayment, { count: number; cents: number }>();
  for (const s of sales) {
    const row = byMethod.get(s.counter_payment) ?? { count: 0, cents: 0 };
    row.count++;
    row.cents += s.total_cents;
    byMethod.set(s.counter_payment, row);
  }
  return {
    totalCents: sales.reduce((n, s) => n + s.total_cents, 0),
    count: sales.length,
    methods: (Object.keys(COUNTER_PAYMENTS) as CounterPayment[]).filter((m) => byMethod.has(m)).map((m) => ({ method: m, label: COUNTER_PAYMENTS[m], ...byMethod.get(m)! })),
  };
}
