import { describe, expect, it } from "vitest";
import { birthdayCode, birthdayGift, birthdaysOn, formatBirthday, parseBirthday, parseBirthdayForm, upcomingBirthdays } from "@/lib/birthday";
import { parseBRL } from "@/lib/money";
import { WA_AUTO_EVENTS, WA_EVENTS } from "@/lib/whatsapp-events";

describe("cupom de aniversário", () => {
  it("lê o aniversário em vários jeitos e recusa data impossível", () => {
    expect(parseBirthday("15/03")).toBe("03-15");
    expect(parseBirthday("5/3")).toBe("03-05");
    expect(parseBirthday("1503")).toBe("03-15");
    expect(parseBirthday("29/02")).toBe("02-29");
    expect(parseBirthday("31/04")).toBeNull();
    expect(parseBirthday("32/01")).toBeNull();
    expect(parseBirthday("")).toBeNull();
    expect(parseBirthday(null)).toBeNull();
    expect(formatBirthday("03-15")).toBe("15/03");
  });

  it("quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos", () => {
    expect(birthdaysOn("2027-02-28")).toEqual(["02-28", "02-29"]);
    expect(birthdaysOn("2028-02-28")).toEqual(["02-28"]);
    expect(birthdaysOn("2028-02-29")).toEqual(["02-29"]);
    expect(birthdaysOn("2026-10-27")).toEqual(["10-27"]);
  });

  it("código pessoal fácil de ler", () => {
    expect(birthdayCode(() => 0)).toBe("NIVERAAAAAA");
    expect(birthdayCode()).toMatch(/^NIVER[A-HJ-NP-Z2-9]{6}$/);
  });

  it("próximos aniversários, inclusive virando o ano", () => {
    const rows = [
      { name: "Ana", birthday: "10-27" },
      { name: "Bia", birthday: "11-10" },
      { name: "Caio", birthday: "01-05" },
      { name: "Duda", birthday: "06-01" },
    ];
    expect(upcomingBirthdays(rows, "2026-10-27", 30).map((r) => `${r.name}:${r.inDays}`)).toEqual(["Ana:0", "Bia:14"]);
    expect(upcomingBirthdays(rows, "2026-12-20", 30).map((r) => `${r.name}:${r.inDays}`)).toEqual(["Caio:16"]);
  });

  it("configuração do painel", () => {
    expect(parseBirthdayForm({ enabled: true, kind: "percent", value: "15", validDays: "30", scope: "all" }, parseBRL)).toEqual({
      config: { enabled: true, kind: "percent", value: 15, validDays: 30, appliesTo: "all" },
    });
    expect(parseBirthdayForm({ enabled: true, kind: "fixed", value: "20,00", validDays: "15", scope: "services" }, parseBRL)).toMatchObject({ config: { value: 2000, appliesTo: "services" } });
    expect(parseBirthdayForm({ enabled: true, kind: "percent", value: "15", validDays: "45", scope: "all" }, parseBRL)).toEqual({ error: "Escolha a validade do cupom." });
    expect(birthdayGift({ kind: "percent", value: 15 })).toBe("15% de desconto");
  });

  it("o WhatsApp do aniversário é marketing (só para quem aceitou) e fica fora dos eventos automáticos da loja", () => {
    expect(WA_EVENTS.birthday.audience).toBe("optin");
    expect(WA_AUTO_EVENTS).not.toContain("birthday");
  });
});
