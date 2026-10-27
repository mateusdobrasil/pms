// Resumo do mês do lojista (e-mail do dia 1). Funções puras, testadas em tests/monthly-report.test.ts.
import { type TopProduct, dayBR, topProducts } from "@/lib/sales";
import type { CouponResult } from "@/lib/coupons";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Mês anterior ao dia de hoje (Brasília): primeiro dia, intervalo em instantes e nome ("outubro de 2026").
export function previousMonth(today: string) {
  const [y, m] = today.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return monthOf(year, month);
}

export function monthOf(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return {
    month: `${year}-${pad(month)}-01`,
    from: new Date(`${year}-${pad(month)}-01T00:00:00-03:00`).toISOString(),
    to: new Date(`${next.y}-${pad(next.m)}-01T00:00:00-03:00`).toISOString(),
    label: `${MONTHS[month - 1]} de ${year}`,
    name: MONTHS[month - 1],
  };
}

// "?mes=2026-10" das telas por mês; sem parâmetro (ou inválido), o mês de hoje.
export function parseMonthParam(param: string | undefined, today: string) {
  const [ty, tm] = today.split("-").map(Number);
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? "");
  const ok = m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  return ok ? { year: Number(m[1]), month: Number(m[2]) } : { year: ty, month: tm };
}

// Mês anterior/seguinte (delta em meses).
export function shiftMonth(year: number, month: number, delta: number) {
  const t = year * 12 + (month - 1) + delta;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
}

export type ReportInput = {
  orders: { total_cents: number; paid_at: string }[];
  items: { product_name: string; unit_price_cents: number; quantity: number }[]; // só produtos (sem links de pagamento)
  fees: { feeCents: number; netCents: number }[]; // pagamentos aprovados com taxa conhecida
  previousSalesCents: number;
  bookings: { status: string }[]; // agendamentos com horário no mês
  newCustomers: number;
  awayCustomers: number; // sumidos há 60+ dias, sem horário marcado
  coupons?: CouponResult[]; // cupons usados no mês (couponSummary), do que mais vendeu ao que menos
};

export type Report = {
  salesCents: number;
  orders: number;
  avgTicketCents: number;
  netCents: number | null; // só quando todas as vendas têm a taxa conhecida
  feeCents: number;
  changePercent: number | null; // contra o mês anterior (null se o anterior foi zero)
  bestDay: { date: string; cents: number } | null;
  top: TopProduct[];
  attended: number;
  noShows: number;
  canceled: number;
  newCustomers: number;
  awayCustomers: number;
  coupons: CouponResult[]; // os 3 que mais venderam
  hasActivity: boolean;
};

export function buildReport(input: ReportInput): Report {
  const salesCents = input.orders.reduce((s, o) => s + o.total_cents, 0);
  const orders = input.orders.length;
  const byDay = new Map<string, number>();
  for (const o of input.orders) byDay.set(dayBR(o.paid_at), (byDay.get(dayBR(o.paid_at)) ?? 0) + o.total_cents);
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const feeCents = input.fees.reduce((s, f) => s + f.feeCents, 0);
  const attended = input.bookings.filter((b) => b.status === "completed" || b.status === "confirmed").length;
  const noShows = input.bookings.filter((b) => b.status === "no_show").length;
  const canceled = input.bookings.filter((b) => b.status === "canceled").length;
  return {
    salesCents,
    orders,
    avgTicketCents: orders ? Math.round(salesCents / orders) : 0,
    netCents: orders && input.fees.length === orders ? input.fees.reduce((s, f) => s + f.netCents, 0) : null,
    feeCents,
    changePercent: input.previousSalesCents > 0 ? Math.round(((salesCents - input.previousSalesCents) / input.previousSalesCents) * 100) : null,
    bestDay: best ? { date: best[0], cents: best[1] } : null,
    top: topProducts(input.items, 3),
    attended,
    noShows,
    canceled,
    newCustomers: input.newCustomers,
    awayCustomers: input.awayCustomers,
    coupons: (input.coupons ?? []).slice(0, 3),
    hasActivity: orders > 0 || attended + noShows + canceled > 0,
  };
}
