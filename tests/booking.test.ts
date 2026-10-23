import { describe, expect, it } from "vitest";
import { formatDuration, formatRanges, onlineCents, parseRanges, parseTime } from "@/lib/booking";

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
