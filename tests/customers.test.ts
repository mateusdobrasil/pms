import { describe, expect, it } from "vitest";
import { type Activity, daysSince, fillMessage, groupCustomers, normalizePhone } from "@/lib/customers";

const act = (a: Partial<Activity>): Activity => ({ kind: "order", name: "Ana Souza", phone: null, email: null, at: "2026-01-01T12:00:00Z", cents: 1000, ...a });

describe("clientes da loja", () => {
  it("celular: só dígitos, sem 55, 10 ou 11 números", () => {
    expect(normalizePhone("(11) 98888-7777")).toBe("11988887777");
    expect(normalizePhone("5511988887777")).toBe("11988887777");
    expect(normalizePhone("1133334444")).toBe("1133334444");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("junta compras e agendamentos da mesma pessoa pelo celular ou e-mail", () => {
    const list = groupCustomers([
      act({ email: "ANA@x.com", at: "2026-01-01T12:00:00Z", cents: 5000 }), // compra só com e-mail
      act({ kind: "booking", phone: "11988887777", email: "ana@x.com", at: "2026-03-01T12:00:00Z", cents: 8000, name: "Ana S." }),
      act({ kind: "booking", phone: "(11) 98888-7777", at: "2026-02-01T12:00:00Z", cents: 2000 }), // só celular
      act({ name: "Bia", phone: "21977776666", at: "2026-02-10T12:00:00Z", cents: 3000 }),
    ]);
    expect(list).toHaveLength(2);
    const ana = list.find((c) => c.key === "11988887777")!;
    expect(ana).toMatchObject({ name: "Ana S.", email: "ana@x.com", orders: 1, bookings: 2, totalCents: 15000, lastAt: "2026-03-01T12:00:00Z", firstAt: "2026-01-01T12:00:00Z" });
  });

  it("sem celular, a chave é o e-mail; sem nenhum dos dois, fica de fora", () => {
    const list = groupCustomers([act({ email: "c@x.com" }), act({ name: "Sem contato" })]);
    expect(list.map((c) => c.key)).toEqual(["c@x.com"]);
  });

  it("horário futuro marcado aparece no cliente", () => {
    const [c] = groupCustomers([act({ phone: "11988887777" })], [
      { phone: "5511988887777", email: null, at: "2026-12-10T12:00:00Z" },
      { phone: "11988887777", email: null, at: "2026-11-10T12:00:00Z" },
      { phone: "21900000000", email: null, at: "2026-11-01T12:00:00Z" }, // outra pessoa
    ]);
    expect(c.nextBookingAt).toBe("2026-11-10T12:00:00Z");
  });

  it("dias desde a última vez e mensagem pronta", () => {
    expect(daysSince("2026-09-01T12:00:00Z", new Date("2026-10-31T12:00:00Z"))).toBe(60);
    expect(fillMessage("Oi, {nome}! Aqui é da {loja}. {link}", { name: "Ana Maria Souza", store: "Salão X", link: "https://x.com" })).toBe(
      "Oi, Ana! Aqui é da Salão X. https://x.com",
    );
  });
});
