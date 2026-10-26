import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOLD_STATUSES } from "@/lib/order-status";
import { normalizePhone } from "@/lib/customers";
import { type LoyaltyConfig, type LoyaltyCounts, isStamp } from "@/lib/loyalty";

// Leitura do cartão fidelidade (configuração da loja e carimbos de um cliente). Sem as colunas
// (SQL 20261113000000 não rodado), o programa fica desligado.
export async function getLoyaltyConfig(db: SupabaseClient, storeId: string): Promise<LoyaltyConfig | null> {
  const { data, error } = await db
    .from("stores")
    .select("loyalty_enabled, loyalty_goal, loyalty_reward, loyalty_counts, loyalty_min_order_cents, loyalty_started_at")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as { loyalty_enabled: boolean; loyalty_goal: number; loyalty_reward: string | null; loyalty_counts: LoyaltyCounts; loyalty_min_order_cents: number; loyalty_started_at: string | null };
  return { enabled: d.loyalty_enabled && !!d.loyalty_reward, goal: d.loyalty_goal, reward: d.loyalty_reward ?? "", counts: d.loyalty_counts, minOrderCents: d.loyalty_min_order_cents, startedAt: d.loyalty_started_at };
}

// Chave do cliente no cartão: o celular (como em Clientes) ou, sem celular, o e-mail.
export const loyaltyKey = (phone: string | null | undefined, email: string | null | undefined) => normalizePhone(phone) ?? (email?.trim().toLowerCase() || null);

// Carimbos de um cliente (pelo celular ou pelo e-mail): compras pagas e atendimentos desde o início do programa.
export async function customerStamps(db: SupabaseClient, storeId: string, cfg: LoyaltyConfig, who: { email?: string | null; phone?: string | null }) {
  if (!cfg.enabled || !cfg.startedAt) return 0;
  const phone = normalizePhone(who.phone);
  const email = who.email?.trim().toLowerCase() || null;
  const match = [email && `customer_email.eq."${email.replace(/"/g, "")}"`, phone && `customer_phone.eq."${phone}"`].filter(Boolean).join(",");
  if (!match) return 0;
  const [{ data: orders }, { data: bookings }] = await Promise.all([
    cfg.counts === "bookings"
      ? Promise.resolve({ data: [] })
      : db.from("orders").select("total_cents, paid_at").eq("store_id", storeId).in("status", SOLD_STATUSES).gte("paid_at", cfg.startedAt).or(match).limit(1000),
    cfg.counts === "orders"
      ? Promise.resolve({ data: [] })
      : db.from("bookings").select("price_cents, starts_at, status").eq("store_id", storeId).eq("status", "completed").gte("starts_at", cfg.startedAt).or(match).limit(1000),
  ]);
  const o = ((orders ?? []) as { total_cents: number; paid_at: string }[]).filter((x) => isStamp(cfg, { kind: "order", at: x.paid_at, cents: x.total_cents }));
  const b = ((bookings ?? []) as { price_cents: number; starts_at: string; status: string }[]).filter((x) => isStamp(cfg, { kind: "booking", at: x.starts_at, cents: x.price_cents, status: x.status }));
  return o.length + b.length;
}
