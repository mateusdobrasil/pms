// Cartão fidelidade digital. Funções puras, testadas em tests/loyalty.test.ts.

export type LoyaltyCounts = "orders" | "bookings" | "both";

export type LoyaltyConfig = {
  enabled: boolean;
  goal: number; // carimbos para ganhar o prêmio
  reward: string; // "1 corte grátis"
  counts: LoyaltyCounts;
  minOrderCents: number; // compra abaixo disso não carimba
  startedAt: string | null; // só conta o que veio depois de ligar o programa
};

export const LOYALTY_COUNTS: Record<LoyaltyCounts, string> = {
  bookings: "atendimentos",
  orders: "compras",
  both: "atendimentos e compras",
};

// Vale carimbo? Compra paga (acima do mínimo) ou atendimento marcado como "atendido", depois do início.
// Venda de balcão: o recebimento de um agendamento (fromBooking) não carimba (o atendimento já carimbou);
// com atendimento sem horário (hasServices), conta como atendimento. Uma venda vale no máximo um carimbo.
export function isStamp(
  cfg: LoyaltyConfig,
  a: { kind: "order" | "booking"; at: string; cents: number; status?: string; fromBooking?: boolean; hasServices?: boolean },
) {
  if (!cfg.enabled || !cfg.startedAt || a.at < cfg.startedAt) return false;
  if (a.kind === "order") {
    if (a.fromBooking) return false;
    if (a.hasServices && cfg.counts !== "orders") return true;
    return cfg.counts !== "bookings" && a.cents >= cfg.minOrderCents;
  }
  return cfg.counts !== "orders" && a.status === "completed";
}

// Carimbos → prêmios conquistados e progresso no cartão atual.
export function loyaltyProgress(stamps: number, goal: number) {
  const earned = Math.floor(stamps / goal);
  const current = stamps - earned * goal;
  return { earned, current, missing: goal - current };
}

// "Cartão fidelidade: 7 de 10. Faltam 3 para ganhar 1 corte grátis."
export function progressText(cfg: LoyaltyConfig, stamps: number) {
  const { current, missing } = loyaltyProgress(stamps, cfg.goal);
  return `Cartão fidelidade: ${current} de ${cfg.goal}. ${missing === 1 ? "Falta 1" : `Faltam ${missing}`} para ganhar ${cfg.reward}.`;
}
