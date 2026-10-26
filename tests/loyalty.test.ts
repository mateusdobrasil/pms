import { describe, expect, it } from "vitest";
import { type LoyaltyConfig, isStamp, loyaltyProgress, progressText } from "@/lib/loyalty";

const cfg: LoyaltyConfig = { enabled: true, goal: 10, reward: "1 corte grátis", counts: "both", minOrderCents: 5000, startedAt: "2026-10-01T00:00:00Z" };

describe("carimbos do cartão fidelidade", () => {
  it("compra paga acima do mínimo e atendimento atendido, depois do início", () => {
    expect(isStamp(cfg, { kind: "order", at: "2026-10-10T12:00:00Z", cents: 5000 })).toBe(true);
    expect(isStamp(cfg, { kind: "order", at: "2026-10-10T12:00:00Z", cents: 4999 })).toBe(false);
    expect(isStamp(cfg, { kind: "booking", at: "2026-10-10T12:00:00Z", cents: 1000, status: "completed" })).toBe(true);
    expect(isStamp(cfg, { kind: "booking", at: "2026-10-10T12:00:00Z", cents: 1000, status: "confirmed" })).toBe(false);
    expect(isStamp(cfg, { kind: "order", at: "2026-09-30T23:59:59Z", cents: 9000 })).toBe(false); // antes de ligar
  });

  it("o que conta: só atendimentos ou só compras", () => {
    expect(isStamp({ ...cfg, counts: "bookings" }, { kind: "order", at: "2026-10-10T12:00:00Z", cents: 9000 })).toBe(false);
    expect(isStamp({ ...cfg, counts: "orders" }, { kind: "booking", at: "2026-10-10T12:00:00Z", cents: 9000, status: "completed" })).toBe(false);
  });

  it("programa desligado não carimba", () => {
    expect(isStamp({ ...cfg, enabled: false }, { kind: "order", at: "2026-10-10T12:00:00Z", cents: 9000 })).toBe(false);
  });
});

describe("progresso", () => {
  it("prêmios conquistados e carimbos no cartão atual", () => {
    expect(loyaltyProgress(0, 10)).toEqual({ earned: 0, current: 0, missing: 10 });
    expect(loyaltyProgress(10, 10)).toEqual({ earned: 1, current: 0, missing: 10 });
    expect(loyaltyProgress(23, 10)).toEqual({ earned: 2, current: 3, missing: 7 });
  });

  it("texto do e-mail", () => {
    expect(progressText(cfg, 7)).toBe("Cartão fidelidade: 7 de 10. Faltam 3 para ganhar 1 corte grátis.");
    expect(progressText(cfg, 9)).toBe("Cartão fidelidade: 9 de 10. Falta 1 para ganhar 1 corte grátis.");
  });
});
