import { describe, expect, it } from "vitest";
import { bookingDays, daySlots, instantOf, mergeSlots, weekdayOf } from "@/lib/booking-slots";

const date = "2026-11-10"; // terça
const base = { date, ranges: [[540, 720], [780, 1080]] as [number, number][], duration: 60, step: 30, busy: [], now: Date.parse("2026-11-01T12:00:00Z"), minNoticeMinutes: 120 };

describe("dias", () => {
  it("dia da semana e próximos dias", () => {
    expect(weekdayOf(date)).toBe(2);
    expect(bookingDays("2026-11-29", 3)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  });
});

describe("daySlots", () => {
  it("de 30 em 30 minutos, cabendo o serviço em cada faixa (o almoço fica livre)", () => {
    const slots = daySlots(base);
    expect(slots[0]).toBe(540); // 09:00
    expect(slots).toContain(660); // 11:00 (termina 12:00)
    expect(slots).not.toContain(690); // 11:30 passaria do almoço
    expect(slots).toContain(780); // 13:00
    expect(slots.at(-1)).toBe(1020); // 17:00 (termina 18:00)
    expect(slots).toHaveLength(5 + 9);
  });

  it("tira o que está ocupado (agendamento das 10:00 às 11:00)", () => {
    const busy: [number, number][] = [[instantOf(date, 600), instantOf(date, 660)]];
    const slots = daySlots({ ...base, busy });
    expect(slots).toContain(540); // 09:00–10:00 encosta, não sobrepõe
    expect(slots).not.toContain(570); // 09:30–10:30 sobrepõe
    expect(slots).not.toContain(600);
    expect(slots).not.toContain(630);
    expect(slots).toContain(660); // 11:00 livre de novo
  });

  it("respeita a antecedência mínima (agora 10:00 do dia, 2 h de antecedência)", () => {
    const now = instantOf(date, 600);
    const slots = daySlots({ ...base, now });
    expect(slots[0]).toBe(780); // 12:00 seria o mínimo, mas o almoço empurra para 13:00
  });

  it("dia sem expediente não tem horário", () => {
    expect(daySlots({ ...base, ranges: [] })).toEqual([]);
  });
});

describe("mergeSlots", () => {
  it("junta os horários e lembra quem está livre", () => {
    expect(mergeSlots([{ id: "ana", slots: [540, 600] }, { id: "bia", slots: [600, 660] }])).toEqual([
      { time: 540, professionals: ["ana"] },
      { time: 600, professionals: ["ana", "bia"] },
      { time: 660, professionals: ["bia"] },
    ]);
  });
});
