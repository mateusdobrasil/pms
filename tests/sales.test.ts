import { describe, expect, it } from "vitest";
import { axisTop, compactBRL, dailySales, dayBR, topProducts, windowStart } from "@/lib/sales";

describe("dailySales", () => {
  it("um ponto por dia, com zero nos dias sem venda", () => {
    const points = dailySales([], "2026-10-22", 30);
    expect(points).toHaveLength(30);
    expect(points[0].date).toBe("2026-09-23");
    expect(points[29].date).toBe("2026-10-22");
    expect(windowStart("2026-10-22", 30)).toBe("2026-09-23");
  });

  it("soma por dia de Brasília e ignora o que está fora da janela", () => {
    const points = dailySales(
      [
        { total_cents: 1000, paid_at: "2026-10-22T12:00:00Z" },
        { total_cents: 500, paid_at: "2026-10-23T02:30:00Z" }, // 23h30 do dia 22 em Brasília
        { total_cents: 700, paid_at: "2026-10-21T15:00:00Z" },
        { total_cents: 999, paid_at: "2026-09-01T15:00:00Z" }, // fora
      ],
      "2026-10-22",
      30,
    );
    expect(points.at(-1)).toEqual({ date: "2026-10-22", cents: 1500, orders: 2 });
    expect(points.at(-2)).toEqual({ date: "2026-10-21", cents: 700, orders: 1 });
    expect(points.reduce((s, p) => s + p.cents, 0)).toBe(2200);
  });

  it("dayBR vira o dia às 3h UTC", () => {
    expect(dayBR("2026-10-23T02:59:00Z")).toBe("2026-10-22");
    expect(dayBR("2026-10-23T03:00:00Z")).toBe("2026-10-23");
  });
});

describe("topProducts", () => {
  it("agrupa pelo nome, ordena pelo valor e limita", () => {
    const top = topProducts(
      [
        { product_name: "Camiseta", unit_price_cents: 7990, quantity: 2 },
        { product_name: "Boné", unit_price_cents: 4990, quantity: 1 },
        { product_name: "Camiseta", unit_price_cents: 7990, quantity: 1 },
        { product_name: "Meia", unit_price_cents: 1990, quantity: 5 },
      ],
      2,
    );
    expect(top).toEqual([
      { name: "Camiseta", cents: 23970, quantity: 3 },
      { name: "Meia", cents: 9950, quantity: 5 },
    ]);
  });
});

describe("eixo", () => {
  it("topo redondo acima do máximo", () => {
    expect(axisTop(0)).toBe(10_000);
    expect(axisTop(7_990)).toBe(10_000); // R$ 79,90 → R$ 100
    expect(axisTop(23_970)).toBe(25_000); // R$ 239,70 → R$ 250
    expect(axisTop(120_000)).toBe(200_000); // R$ 1.200 → R$ 2.000
    expect(axisTop(450_000)).toBe(500_000);
  });

  it("rótulos compactos", () => {
    expect(compactBRL(85_000)).toBe("R$ 850");
    expect(compactBRL(125_000)).toBe("R$ 1,25 mil");
    expect(compactBRL(1_000_000)).toBe("R$ 10 mil");
  });
});
