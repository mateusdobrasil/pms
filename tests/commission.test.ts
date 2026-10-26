import { describe, expect, it } from "vitest";
import { type CommissionBooking, type CommissionRates, buildCommissions, commissionCents, parsePercent, percentLabel } from "@/lib/commission";

const now = new Date("2026-10-31T12:00:00Z");
const bk = (b: Partial<CommissionBooking>): CommissionBooking => ({
  id: Math.random().toString(36),
  professional_id: "ana",
  professional_name: "Ana",
  service_id: "corte",
  service_name: "Corte",
  customer_name: "Cliente",
  starts_at: "2026-10-10T13:00:00Z",
  status: "completed",
  price_cents: 10000,
  commission_percent: null,
  ...b,
});
const rates: CommissionRates = new Map([
  ["ana", { general: 40, perService: new Map([["coloracao", 30]]) }],
  ["bia", { general: null, perService: new Map() }],
]);

describe("percentual de comissão", () => {
  it("lê o que o lojista digita", () => {
    expect(parsePercent("40")).toBe(40);
    expect(parsePercent("37,5")).toBe(37.5);
    expect(parsePercent("12.25%")).toBe(12.25);
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("101")).toBeUndefined();
    expect(parsePercent("abc")).toBeUndefined();
    expect(parsePercent("-5")).toBeUndefined();
  });

  it("valor e rótulo", () => {
    expect(commissionCents(12990, 37.5)).toBe(4871);
    expect(percentLabel(37.5)).toBe("37,5%");
  });
});

describe("comissões do mês", () => {
  it("geral, próprio do serviço e o gravado no atendimento", () => {
    const [ana] = buildCommissions(
      [
        bk({ price_cents: 10000 }), // 40% geral → 4000
        bk({ service_id: "coloracao", service_name: "Coloração", price_cents: 20000 }), // 30% próprio → 6000
        bk({ price_cents: 10000, commission_percent: 50 }), // gravado no atendimento → 5000
      ],
      rates,
      now,
    );
    expect(ana).toMatchObject({ attended: 3, producedCents: 40000, commissionCents: 15000, withoutRate: 0 });
    expect(ana.lines.map((l) => l.percent)).toEqual([40, 30, 50]);
  });

  it("só 'atendido' conta; confirmado no passado aparece como pendente", () => {
    const [ana] = buildCommissions(
      [
        bk({}),
        bk({ status: "confirmed", starts_at: "2026-10-20T13:00:00Z" }), // já passou, não marcado
        bk({ status: "confirmed", starts_at: "2026-11-05T13:00:00Z" }), // futuro: nada
        bk({ status: "no_show" }),
        bk({ status: "canceled" }),
      ],
      rates,
      now,
    );
    expect(ana).toMatchObject({ attended: 1, pendingConfirmation: 1, commissionCents: 4000 });
  });

  it("profissional sem percentual: comissão zero e contagem para avisar", () => {
    const [bia] = buildCommissions([bk({ professional_id: "bia", professional_name: "Bia" })], rates, now);
    expect(bia).toMatchObject({ attended: 1, commissionCents: 0, withoutRate: 1 });
  });

  it("ordem: quem mais produziu primeiro", () => {
    const list = buildCommissions([bk({}), bk({ professional_id: "bia", professional_name: "Bia", price_cents: 50000 })], rates, now);
    expect(list.map((p) => p.name)).toEqual(["Bia", "Ana"]);
  });
});
