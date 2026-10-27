import { describe, expect, it } from "vitest";
import { canSelfManage, formatDuration, formatRanges, googleCalendarUrl, onlineCents, parseRanges, parseTime, whatsappReminderParams } from "@/lib/booking";

describe("pagamento do agendamento", () => {
  it("tudo online, sinal ou no salão", () => {
    expect(onlineCents(8000, "full", null)).toBe(8000);
    expect(onlineCents(8000, "deposit", 30)).toBe(2400);
    expect(onlineCents(9990, "deposit", 30)).toBe(2997);
    expect(onlineCents(8000, "onsite", null)).toBe(0);
  });
});

describe("durações e horários", () => {
  it("formata a duração", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h30");
  });

  it("lê horário", () => {
    expect(parseTime("09:00")).toBe(540);
    expect(parseTime("23:59")).toBe(1439);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("9h")).toBeNull();
  });

  it("lê as faixas do dia", () => {
    expect(parseRanges("13:00-18:00, 09:00-12:00")).toEqual({ ranges: [[540, 720], [780, 1080]] });
    expect(parseRanges("09:00 às 18:00")).toEqual({ ranges: [[540, 1080]] });
    expect(parseRanges("")).toEqual({ ranges: [] });
    expect(parseRanges("09:00-12:00, 11:00-14:00")).toEqual({ error: "As faixas de horário do mesmo dia não podem se sobrepor." });
    expect("error" in parseRanges("18:00-09:00")).toBe(true);
    expect("error" in parseRanges("manhã")).toBe(true);
    expect(formatRanges([[540, 720], [780, 1080]])).toBe("09:00-12:00, 13:00-18:00");
  });
});

describe("agenda do cliente", () => {
  it("link do Google Agenda em UTC", () => {
    const url = new URL(googleCalendarUrl({ title: "Corte", startsAt: "2026-11-10T14:30:00-03:00", endsAt: "2026-11-10T15:30:00-03:00", location: "Rua A" }));
    expect(url.searchParams.get("dates")).toBe("20261110T173000Z/20261110T183000Z");
    expect(url.searchParams.get("text")).toBe("Corte");
    expect(url.searchParams.get("location")).toBe("Rua A");
  });

  it("cancelar/remarcar só até o prazo", () => {
    const now = Date.parse("2026-11-09T14:00:00-03:00");
    expect(canSelfManage("2026-11-10T15:00:00-03:00", 24, now)).toBe(true);
    expect(canSelfManage("2026-11-10T13:00:00-03:00", 24, now)).toBe(false);
    expect(canSelfManage("2026-11-09T15:00:00-03:00", 0, now)).toBe(true);
  });
});

describe("lembrete no WhatsApp", () => {
  it("parâmetros do template: primeiro nome, loja, serviço, hora de Brasília, profissional e link", () => {
    expect(
      whatsappReminderParams({ customerName: "Ana Maria Souza", storeName: "Salão X", serviceName: "Escova", startsAt: "2026-10-31T17:00:00Z", professionalName: "Bia", link: "https://x.com/agendamento/abc" }),
    ).toEqual(["Ana", "Salão X", "Escova", "14:00", "Bia", "https://x.com/agendamento/abc"]);
  });
});
