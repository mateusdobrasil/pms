import { describe, expect, it } from "vitest";
import { type FinanceInvoice, type FinanceStore, financeSummary, lastMonths, monthLabel, receivedByMonth, storeBillingStatus } from "@/lib/finance";

const inv = (o: Partial<FinanceInvoice>): FinanceInvoice => ({
  id: Math.random().toString(),
  store_id: "a",
  kind: "monthly",
  reference_month: "2026-10-01",
  amount_cents: 30000,
  due_date: "2026-10-09",
  status: "open",
  paid_at: null,
  payment_method: null,
  ...o,
});
const store = (o: Partial<FinanceStore>): FinanceStore => ({
  id: "a",
  name: "Loja A",
  status: "active",
  setup_fee_cents: 0,
  monthly_fee_cents: 30000,
  billing_starts_on: "2026-10-09",
  suspended_for_billing: false,
  ...o,
});

describe("meses", () => {
  it("últimos 12 meses, virando o ano", () => {
    const m = lastMonths("2026-10-22", 12);
    expect(m[0]).toBe("2025-11");
    expect(m[11]).toBe("2026-10");
    expect(monthLabel("2026-01")).toBe("jan/26");
  });

  it("recebido por mês pela data do pagamento (Brasília), separando implantação", () => {
    const pts = receivedByMonth(
      [
        inv({ status: "paid", paid_at: "2026-10-05T15:00:00Z" }),
        inv({ status: "paid", kind: "setup", reference_month: null, amount_cents: 200000, paid_at: "2026-10-01T02:00:00Z" }), // 23h de 30/09
        inv({ status: "open" }),
        inv({ status: "paid", paid_at: "2024-01-05T15:00:00Z" }), // fora da janela
      ],
      "2026-10-22",
      12,
    );
    expect(pts.at(-1)).toEqual({ month: "2026-10", setup: 0, monthly: 30000, total: 30000, count: 1 });
    expect(pts.at(-2)).toEqual({ month: "2026-09", setup: 200000, monthly: 0, total: 200000, count: 1 });
  });
});

describe("resumo", () => {
  it("mensalidade contratada, recebido no mês, a receber e vencido", () => {
    const s = financeSummary(
      [store({}), store({ id: "b", monthly_fee_cents: 25000 }), store({ id: "c", monthly_fee_cents: 0, billing_starts_on: null })],
      [
        inv({ status: "paid", paid_at: "2026-10-10T15:00:00Z" }),
        inv({ store_id: "b", due_date: "2026-11-09", amount_cents: 25000 }),
        inv({ store_id: "b", due_date: "2026-10-09", amount_cents: 25000 }),
        inv({ status: "canceled", due_date: "2026-09-09" }),
      ],
      "2026-10-22",
    );
    expect(s).toEqual({
      mrrCents: 55000,
      payingStores: 2,
      receivedCents: 30000,
      receivedCount: 1,
      upcomingCents: 25000,
      upcomingCount: 1,
      overdueCents: 25000,
      overdueCount: 1,
    });
  });

  it("situação da loja", () => {
    const today = "2026-10-22";
    expect(storeBillingStatus(store({ suspended_for_billing: true }), [], today)).toBe("suspensa");
    expect(storeBillingStatus(store({}), [inv({ due_date: "2026-10-09" })], today)).toBe("vencida");
    expect(storeBillingStatus(store({ monthly_fee_cents: 0, billing_starts_on: null }), [], today)).toBe("isenta");
    expect(storeBillingStatus(store({ billing_starts_on: "2026-11-09" }), [], today)).toBe("a iniciar");
    expect(storeBillingStatus(store({}), [inv({ due_date: "2026-11-09" })], today)).toBe("em dia");
  });
});
