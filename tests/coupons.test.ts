import { describe, expect, it } from "vitest";
import { type Coupon, couponDiscountCents, couponProblem, couponStatus, discountLines, normalizeCouponCode, parseCouponForm } from "@/lib/coupons";
import { parseBRL } from "@/lib/money";
import { readBioLinks, parseBioLinks } from "@/lib/bio-links";

const base: Coupon = {
  id: "c1",
  code: "BEMVINDO10",
  kind: "percent",
  value: 10,
  min_subtotal_cents: null,
  starts_at: null,
  ends_at: null,
  max_uses: null,
  once_per_customer: false,
  active: true,
};
const none = { total: 0, byCustomer: 0 };
const now = new Date("2026-11-10T15:00:00-03:00");

describe("cupons", () => {
  it("código: maiúsculas, sem espaços; inválido vira null", () => {
    expect(normalizeCouponCode("  bemvindo10 ")).toBe("BEMVINDO10");
    expect(normalizeCouponCode("ab")).toBeNull();
    expect(normalizeCouponCode("cupom!")).toBeNull();
  });

  it("desconto: percentual arredonda para baixo; fixo nunca passa dos produtos", () => {
    expect(couponDiscountCents({ kind: "percent", value: 10 }, 7999)).toBe(799);
    expect(couponDiscountCents({ kind: "fixed", value: 2000 }, 15000)).toBe(2000);
    expect(couponDiscountCents({ kind: "fixed", value: 2000 }, 1500)).toBe(1500);
  });

  it("regras: ativo, período, mínimo, limite e 1 por CPF", () => {
    expect(couponProblem(base, 5000, now, none)).toBeNull();
    expect(couponProblem({ ...base, active: false }, 5000, now, none)).toMatch(/não está mais ativo/);
    expect(couponProblem({ ...base, starts_at: "2026-11-11T00:00:00-03:00" }, 5000, now, none)).toMatch(/ainda não começou/);
    expect(couponProblem({ ...base, ends_at: "2026-11-09T23:59:59-03:00" }, 5000, now, none)).toMatch(/expirou/);
    expect(couponProblem({ ...base, ends_at: "2026-11-10T23:59:59-03:00" }, 5000, now, none)).toBeNull(); // vale o dia todo
    expect(couponProblem({ ...base, min_subtotal_cents: 10000 }, 9999, now, none)).toMatch(/a partir de R\$\s100,00/);
    expect(couponProblem({ ...base, max_uses: 3 }, 5000, now, { total: 3, byCustomer: 0 })).toMatch(/limite de usos/);
    expect(couponProblem({ ...base, once_per_customer: true }, 5000, now, { total: 1, byCustomer: 1 })).toMatch(/já usou/);
  });

  it("situação no painel", () => {
    expect(couponStatus(base, now, 0).label).toBe("Ativo");
    expect(couponStatus({ ...base, max_uses: 2 }, now, 2).label).toBe("Esgotado");
    expect(couponStatus({ ...base, starts_at: "2026-12-01T00:00:00-03:00" }, now, 0).label).toBe("Agendado");
  });

  it("formulário do painel", () => {
    const f = { code: "natal", kind: "fixed", value: "20,00", min: "100", starts: "2026-12-01", ends: "2026-12-25", maxUses: "50", once: true };
    expect(parseCouponForm(f, parseBRL)).toEqual({
      coupon: {
        code: "NATAL",
        kind: "fixed",
        value: 2000,
        min_subtotal_cents: 10000,
        starts_at: "2026-12-01T00:00:00-03:00",
        ends_at: "2026-12-25T23:59:59-03:00",
        max_uses: 50,
        once_per_customer: true,
      },
    });
    expect(parseCouponForm({ ...f, kind: "percent", value: "95" }, parseBRL)).toEqual({ error: expect.stringMatching(/1 a 90/) });
    expect(parseCouponForm({ ...f, ends: "2026-11-30" }, parseBRL)).toEqual({ error: expect.stringMatching(/antes do começo/) });
  });

  it("linhas de desconto: cupom e Pix separados; balcão com o próprio nome", () => {
    expect(discountLines(1500, { code: "X10", cents: 1000 })).toEqual([
      { label: "Cupom X10", cents: 1000 },
      { label: "Desconto Pix", cents: 500 },
    ]);
    expect(discountLines(1000, { code: "X10", cents: 1000 })).toEqual([{ label: "Cupom X10", cents: 1000 }]);
    expect(discountLines(300, null, "Desconto")).toEqual([{ label: "Desconto", cents: 300 }]);
  });
});

describe("página de links da bio", () => {
  it("links do formulário: completa https, ignora linhas vazias, recusa endereço ruim", () => {
    expect(parseBioLinks(["Como chegar", "", "Promoções"], ["maps.app.goo.gl/abc", "", "/c/promocoes"])).toEqual({
      links: [
        { title: "Como chegar", url: "https://maps.app.goo.gl/abc" },
        { title: "Promoções", url: "/c/promocoes" },
      ],
    });
    expect(parseBioLinks(["iFood"], ["javascript:alert(1)"])).toEqual({ error: expect.stringMatching(/Endereço inválido/) });
    expect(parseBioLinks([""], ["https://x.com"])).toEqual({ error: expect.stringMatching(/nome ao link 1/) });
  });

  it("lido do banco: só o que está no formato", () => {
    expect(readBioLinks([{ title: "Ok", url: "https://a.com" }, { title: "Ruim", url: "http://a.com" }, "lixo"])).toEqual([{ title: "Ok", url: "https://a.com" }]);
    expect(readBioLinks(null)).toEqual([]);
  });
});
