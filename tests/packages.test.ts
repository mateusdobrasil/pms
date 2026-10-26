import { describe, expect, it } from "vitest";
import { type CustomerPackageRow, expiresAt, packageState, perSessionCents, pickPackage, remaining } from "@/lib/packages";

const now = new Date("2026-10-31T12:00:00Z");
const pkg = (p: Partial<CustomerPackageRow>): CustomerPackageRow => ({ id: "a", service_id: "escova", sessions_total: 5, status: "active", expires_at: null, used: 0, ...p });

describe("pacotes de sessões", () => {
  it("sessões restantes e situação", () => {
    expect(remaining(pkg({ used: 2 }))).toBe(3);
    expect(packageState(pkg({ used: 2 }), now)).toBe("active");
    expect(packageState(pkg({ used: 5 }), now)).toBe("used_up");
    expect(packageState(pkg({ expires_at: "2026-10-30T00:00:00Z" }), now)).toBe("expired");
    expect(packageState(pkg({ status: "canceled", used: 5 }), now)).toBe("canceled");
  });

  it("validade a partir da venda", () => {
    expect(expiresAt(90, now)).toBe("2027-01-29T12:00:00.000Z");
    expect(expiresAt(null, now)).toBeNull();
  });

  it("usa o pacote do serviço que vence primeiro; sem validade por último", () => {
    const list = [
      pkg({ id: "sem-validade" }),
      pkg({ id: "vence-dez", expires_at: "2026-12-01T00:00:00Z" }),
      pkg({ id: "vence-nov", expires_at: "2026-11-10T00:00:00Z" }),
      pkg({ id: "outro-servico", service_id: "corte", expires_at: "2026-11-01T00:00:00Z" }),
      pkg({ id: "usado", expires_at: "2026-11-05T00:00:00Z", used: 5 }),
      pkg({ id: "vencido", expires_at: "2026-10-01T00:00:00Z" }),
    ];
    expect(pickPackage(list, "escova", now)?.id).toBe("vence-nov");
    expect(pickPackage(list, "manicure", now)).toBeNull();
  });

  it("preço por sessão", () => {
    expect(perSessionCents(20000, 5)).toBe(4000);
    expect(perSessionCents(10000, 3)).toBe(3333);
  });
});
