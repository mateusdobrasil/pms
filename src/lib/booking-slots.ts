// Horários livres para agendar. Funções puras, testadas em tests/booking-slots.test.ts.
// Datas "AAAA-MM-DD" e horários em minutos desde a meia-noite, no fuso de Brasília (sem horário de verão desde 2019).

export type Interval = [number, number]; // instantes em ms (início, fim)

export const dayStartMs = (date: string) => Date.parse(`${date}T00:00:00-03:00`);
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const instantOf = (date: string, minutes: number) => dayStartMs(date) + minutes * 60_000;

// Os próximos dias em que dá para agendar (hoje incluído).
export function bookingDays(today: string, maxDays: number) {
  const start = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: maxDays }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Inícios possíveis num dia: dentro de cada faixa de trabalho, de `step` em `step` minutos a partir do início da faixa,
// cabendo o serviço inteiro, respeitando a antecedência mínima e sem encostar em nada ocupado.
export function daySlots(args: {
  date: string;
  ranges: [number, number][]; // faixas de trabalho do dia, em minutos
  duration: number;
  step: number;
  busy: Interval[]; // agendamentos e bloqueios do profissional
  now: number;
  minNoticeMinutes: number;
}): number[] {
  const { date, ranges, duration, step, busy, now, minNoticeMinutes } = args;
  const earliest = now + minNoticeMinutes * 60_000;
  const slots: number[] = [];
  for (const [from, to] of ranges) {
    for (let t = from; t + duration <= to; t += step) {
      const start = instantOf(date, t);
      const end = start + duration * 60_000;
      if (start < earliest) continue;
      if (busy.some(([bs, be]) => start < be && end > bs)) continue;
      slots.push(t);
    }
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

// "Qualquer profissional": junta os horários de todos e lembra quem está livre em cada um.
export function mergeSlots(byProfessional: { id: string; slots: number[] }[]) {
  const map = new Map<number, string[]>();
  for (const p of byProfessional) for (const t of p.slots) map.set(t, [...(map.get(t) ?? []), p.id]);
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([time, professionals]) => ({ time, professionals }));
}
