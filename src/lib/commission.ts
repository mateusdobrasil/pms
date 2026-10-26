// Comissão por profissional (Agenda → Comissões). Funções puras, testadas em tests/commission.test.ts.

// "40", "37,5", "12.5%" → número; vazio → null (sem percentual); fora de 0–100 ou inválido → undefined.
export function parsePercent(input: string): number | null | undefined {
  const s = input.trim().replace("%", "").replace(",", ".");
  if (!s) return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : undefined;
}

export const percentLabel = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

// Percentual do serviço para o profissional: o próprio do serviço, senão o geral dele.
export const effectivePercent = (general: number | null, perService: number | null | undefined) => perService ?? general;

export const commissionCents = (priceCents: number, percent: number) => Math.round((priceCents * percent) / 100);

export type CommissionBooking = {
  id: string;
  professional_id: string | null;
  professional_name: string;
  service_id: string | null;
  service_name: string;
  customer_name: string;
  starts_at: string;
  status: string;
  price_cents: number;
  commission_percent: number | null; // gravado ao marcar "atendido"
};

export type CommissionRates = Map<string, { general: number | null; perService: Map<string, number | null> }>;

export type CommissionLine = CommissionBooking & { percent: number | null; commissionCents: number };

export type ProfessionalCommission = {
  professionalId: string;
  name: string;
  attended: number;
  producedCents: number;
  commissionCents: number;
  withoutRate: number; // atendimentos sem percentual definido (comissão 0)
  pendingConfirmation: number; // dias que já passaram ainda como "confirmado" (não entram na conta)
  lines: CommissionLine[];
};

// Uma linha por profissional: só atendimentos marcados como "atendido" entram na comissão.
export function buildCommissions(bookings: CommissionBooking[], rates: CommissionRates, now = new Date()): ProfessionalCommission[] {
  const byPro = new Map<string, ProfessionalCommission>();
  const row = (b: CommissionBooking) => {
    const key = b.professional_id ?? `nome:${b.professional_name}`;
    let r = byPro.get(key);
    if (!r) {
      r = { professionalId: key, name: b.professional_name, attended: 0, producedCents: 0, commissionCents: 0, withoutRate: 0, pendingConfirmation: 0, lines: [] };
      byPro.set(key, r);
    }
    return r;
  };
  for (const b of [...bookings].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
    if (b.status === "confirmed" && Date.parse(b.starts_at) < now.getTime()) {
      row(b).pendingConfirmation++;
      continue;
    }
    if (b.status !== "completed") continue;
    const rate = b.professional_id ? rates.get(b.professional_id) : undefined;
    const percent = b.commission_percent ?? (rate ? effectivePercent(rate.general, b.service_id ? rate.perService.get(b.service_id) : null) : null);
    const cents = percent == null ? 0 : commissionCents(b.price_cents, percent);
    const r = row(b);
    r.attended++;
    r.producedCents += b.price_cents;
    r.commissionCents += cents;
    if (percent == null) r.withoutRate++;
    r.lines.push({ ...b, percent, commissionCents: cents });
  }
  return [...byPro.values()].sort((a, b) => b.producedCents - a.producedCents || a.name.localeCompare(b.name));
}
