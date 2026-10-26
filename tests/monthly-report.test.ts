import { describe, expect, it } from "vitest";
import { buildReport, monthOf, previousMonth } from "@/lib/monthly-report";

describe("mês do resumo", () => {
  it("mês anterior, inclusive na virada do ano", () => {
    expect(previousMonth("2026-11-01")).toMatchObject({ month: "2026-10-01", label: "outubro de 2026" });
    expect(previousMonth("2027-01-02")).toMatchObject({ month: "2026-12-01", label: "dezembro de 2026" });
  });

  it("intervalo no fuso de Brasília", () => {
    const m = monthOf(2026, 10);
    expect(m.from).toBe("2026-10-01T03:00:00.000Z");
    expect(m.to).toBe("2026-11-01T03:00:00.000Z");
  });
});

describe("números do resumo", () => {
  const base = { items: [], fees: [], previousSalesCents: 0, bookings: [], newCustomers: 0, awayCustomers: 0 };

  it("vendas, ticket médio, melhor dia e comparação com o mês anterior", () => {
    const r = buildReport({
      ...base,
      orders: [
        { total_cents: 10000, paid_at: "2026-10-05T15:00:00Z" },
        { total_cents: 5000, paid_at: "2026-10-05T20:00:00Z" },
        { total_cents: 12000, paid_at: "2026-10-20T02:00:00Z" }, // 19/10 em Brasília
      ],
      previousSalesCents: 20000,
    });
    expect(r).toMatchObject({ salesCents: 27000, orders: 3, avgTicketCents: 9000, changePercent: 35, bestDay: { date: "2026-10-05", cents: 15000 } });
    expect(r.hasActivity).toBe(true);
  });

  it("líquido só quando todas as vendas têm a taxa", () => {
    const orders = [{ total_cents: 10000, paid_at: "2026-10-05T15:00:00Z" }, { total_cents: 10000, paid_at: "2026-10-06T15:00:00Z" }];
    expect(buildReport({ ...base, orders, fees: [{ feeCents: 100, netCents: 9900 }] }).netCents).toBeNull();
    expect(buildReport({ ...base, orders, fees: [{ feeCents: 100, netCents: 9900 }, { feeCents: 499, netCents: 9501 }] })).toMatchObject({ netCents: 19401, feeCents: 599 });
  });

  it("agenda: atendidos, faltas e cancelamentos; mês parado não tem atividade", () => {
    const r = buildReport({ ...base, orders: [], bookings: [{ status: "completed" }, { status: "confirmed" }, { status: "no_show" }, { status: "canceled" }] });
    expect(r).toMatchObject({ attended: 2, noShows: 1, canceled: 1, salesCents: 0, avgTicketCents: 0, changePercent: null, hasActivity: true });
    expect(buildReport({ ...base, orders: [] }).hasActivity).toBe(false);
  });

  it("mais vendidos: os 3 que mais faturaram", () => {
    const items = ["A", "B", "C", "D"].map((n, i) => ({ product_name: n, unit_price_cents: 1000 * (i + 1), quantity: 1 }));
    expect(buildReport({ ...base, orders: [], items }).top.map((t) => t.name)).toEqual(["D", "C", "B"]);
  });
});
