// Agendamentos: regras comuns (pagamento por serviço, durações, horários). Funções puras, testadas em tests/booking.test.ts.

export type PaymentMode = "full" | "deposit" | "onsite";

export const PAYMENT_MODES: { value: PaymentMode; label: string; hint: string }[] = [
  { value: "onsite", label: "Paga no salão", hint: "O agendamento só reserva o horário." },
  { value: "deposit", label: "Sinal online", hint: "O cliente paga uma parte ao agendar (Pix ou cartão) e o resto no salão." },
  { value: "full", label: "Tudo online", hint: "O cliente paga o valor inteiro ao agendar (Pix ou cartão)." },
];

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Quanto o cliente paga online ao agendar (centavos).
export function onlineCents(priceCents: number, mode: PaymentMode, depositPercent: number | null) {
  if (mode === "full") return priceCents;
  if (mode === "deposit") return Math.round((priceCents * (depositPercent ?? 0)) / 100);
  return 0;
}

// "45 min", "1h", "1h30"
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// "09:00" → 540 (minutos desde a meia-noite); inválido → null.
export function parseTime(value: string) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// Faixas do dia ("09:00-12:00, 13:00-18:00") → [[540, 720], [780, 1080]]; sobreposição ou formato errado → erro.
export function parseRanges(text: string): { ranges: [number, number][] } | { error: string } {
  const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const ranges: [number, number][] = [];
  for (const part of parts) {
    const [a, b] = part.split(/\s*(?:-|–|às|a)\s*/);
    const start = parseTime(a ?? "");
    const end = parseTime(b ?? "");
    if (start === null || end === null) return { error: `"${part}" não é um horário válido (use 09:00-18:00).` };
    if (start >= end) return { error: `"${part}": o fim precisa ser depois do início.` };
    ranges.push([start, end]);
  }
  ranges.sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] < ranges[i - 1][1]) return { error: "As faixas de horário do mesmo dia não podem se sobrepor." };
  }
  return { ranges };
}

export const formatRanges = (ranges: [number, number][]) => ranges.map(([a, b]) => `${formatTime(a)}-${formatTime(b)}`).join(", ");

// Link "Adicionar ao Google Agenda" (datas em UTC no formato AAAAMMDDTHHMMSSZ).
export function googleCalendarUrl(e: { title: string; startsAt: string; endsAt: string; details?: string; location?: string }) {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${fmt(e.startsAt)}/${fmt(e.endsAt)}` });
  if (e.details) params.set("details", e.details);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Até quando o cliente pode cancelar ou remarcar pelo link.
export const canSelfManage = (startsAt: string, cancelHours: number, now = Date.now()) => Date.parse(startsAt) - cancelHours * 3_600_000 > now;

export type BookingStatus = "pending_payment" | "confirmed" | "completed" | "no_show" | "canceled" | "expired";

// Situação do agendamento no painel (rótulo e cor do selo).
export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: string }> = {
  pending_payment: { label: "Aguardando pagamento", tone: "bg-amber-100 text-amber-900 ring-amber-200" },
  confirmed: { label: "Confirmado", tone: "bg-sky-100 text-sky-800 ring-sky-200" },
  completed: { label: "Atendido", tone: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  no_show: { label: "Faltou", tone: "bg-red-100 text-red-800 ring-red-200" },
  canceled: { label: "Cancelado", tone: "bg-neutral-100 text-neutral-600 ring-neutral-200" },
  expired: { label: "Não pagou", tone: "bg-neutral-100 text-neutral-500 ring-neutral-200" },
};
