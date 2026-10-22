// Financeiro da plataforma (/admin → Financeiro): contas sobre as faturas dos lojistas.
// Funções puras, testadas em tests/finance.test.ts. Datas "AAAA-MM-DD" (Brasília).
import { dayBR } from "@/lib/sales";

export type FinanceInvoice = {
  id: string;
  store_id: string;
  kind: "setup" | "monthly";
  reference_month: string | null;
  amount_cents: number;
  due_date: string;
  status: "open" | "paid" | "canceled";
  paid_at: string | null;
  payment_method: string | null;
};

export type FinanceStore = {
  id: string;
  name: string;
  status: "active" | "suspended";
  setup_fee_cents: number;
  monthly_fee_cents: number;
  billing_starts_on: string | null;
  suspended_for_billing: boolean;
};

export type MonthPoint = { month: string; setup: number; monthly: number; total: number; count: number };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`;

// Os últimos n meses até o atual, do mais antigo para o mais novo ("AAAA-MM").
export function lastMonths(today: string, n: number) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

// Recebido por mês (pela data do pagamento), separando implantação e mensalidade.
export function receivedByMonth(invoices: FinanceInvoice[], today: string, n = 12): MonthPoint[] {
  const points = lastMonths(today, n).map((month) => ({ month, setup: 0, monthly: 0, total: 0, count: 0 }));
  const index = new Map(points.map((p, i) => [p.month, i]));
  for (const inv of invoices) {
    if (inv.status !== "paid" || !inv.paid_at) continue;
    const i = index.get(dayBR(inv.paid_at).slice(0, 7));
    if (i === undefined) continue;
    points[i][inv.kind === "setup" ? "setup" : "monthly"] += inv.amount_cents;
    points[i].total += inv.amount_cents;
    points[i].count += 1;
  }
  return points;
}

export function financeSummary(stores: FinanceStore[], invoices: FinanceInvoice[], today: string) {
  const contracted = stores.filter((s) => s.monthly_fee_cents > 0 && s.billing_starts_on);
  const open = invoices.filter((i) => i.status === "open");
  const overdue = open.filter((i) => i.due_date < today);
  const upcoming = open.filter((i) => i.due_date >= today);
  const thisMonth = today.slice(0, 7);
  const received = invoices.filter((i) => i.status === "paid" && i.paid_at && dayBR(i.paid_at).slice(0, 7) === thisMonth);
  const sum = (rows: FinanceInvoice[]) => rows.reduce((s, i) => s + i.amount_cents, 0);
  return {
    mrrCents: contracted.reduce((s, st) => s + st.monthly_fee_cents, 0),
    payingStores: contracted.length,
    receivedCents: sum(received),
    receivedCount: received.length,
    upcomingCents: sum(upcoming),
    upcomingCount: upcoming.length,
    overdueCents: sum(overdue),
    overdueCount: overdue.length,
  };
}

export type StoreBilling = "isenta" | "a iniciar" | "em dia" | "vencida" | "suspensa";

export function storeBillingStatus(store: FinanceStore, invoices: FinanceInvoice[], today: string): StoreBilling {
  if (store.suspended_for_billing) return "suspensa";
  if (invoices.some((i) => i.store_id === store.id && i.status === "open" && i.due_date < today)) return "vencida";
  if (!store.monthly_fee_cents && !store.setup_fee_cents) return "isenta";
  if (store.monthly_fee_cents && store.billing_starts_on && store.billing_starts_on > today) return "a iniciar";
  return "em dia";
}
