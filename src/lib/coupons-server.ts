import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Coupon, type CouponTarget, type OrderCoupon, couponDiscountCents, couponLabel, couponProblem, couponSummary, normalizeCouponCode } from "@/lib/coupons";

export const COUPON_FIELDS = "id, code, kind, value, min_subtotal_cents, starts_at, ends_at, max_uses, once_per_customer, active";

// Cupons com a coluna applies_to (SQL 20261121000000); sem ela, lê sem (o cupom vale em tudo).
export async function selectCoupons(build: (fields: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>) {
  // origin (SQL 20261122000000): cupons pessoais de aniversário, fora da lista principal do painel.
  const full = await build(`${COUPON_FIELDS}, applies_to, origin`);
  if (full.error?.code !== "42703") return full;
  const first = await build(`${COUPON_FIELDS}, applies_to`);
  return first.error?.code === "42703" ? build(COUPON_FIELDS) : first;
}

// O que conta como uso: pedidos pagos (inclui enviados/entregues) e agendamentos confirmados ou atendidos, além
// dos que ainda aguardam pagamento no prazo (reservam o uso; expirado ou cancelado devolve).
const orderUsed = (now: Date) => `status.in.(paid,preparing,shipped,delivered),and(status.eq.pending_payment,expires_at.gt.${now.toISOString()})`;
const bookingUsed = (now: Date) => `status.in.(confirmed,completed,no_show),and(status.eq.pending_payment,expires_at.gt.${now.toISOString()})`;

export type CouponCustomer = { cpf?: string | null; phone?: string | null };

// Mesma pessoa: pelo CPF ou pelo celular (agendamento pago no salão não pede CPF).
function customerFilter(who: CouponCustomer) {
  const parts = [who.cpf && `customer_cpf.eq.${who.cpf}`, who.phone && `customer_phone.eq.${who.phone}`].filter(Boolean);
  return parts.length ? parts.join(",") : null;
}

export async function couponUses(db: SupabaseClient, couponId: string, who: CouponCustomer = {}, now = new Date()) {
  const byWho = customerFilter(who);
  const count = async (table: "orders" | "bookings", mine: boolean) => {
    if (mine && !byWho) return 0;
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("coupon_id", couponId).or(table === "orders" ? orderUsed(now) : bookingUsed(now));
    if (mine) q = q.or(byWho!); // os dois .or() se somam (E)
    const { count: n } = await q; // agendamentos sem a coluna (SQL não rodado): 0
    return n ?? 0;
  };
  const [o, b, om, bm] = await Promise.all([count("orders", false), count("bookings", false), count("orders", true), count("bookings", true)]);
  return { total: o + b, byCustomer: om + bm };
}

// Usos por cupom, para a lista do painel.
export async function couponUseCounts(db: SupabaseClient, storeId: string, now = new Date()) {
  const [{ data: orders }, { data: bookings }] = await Promise.all([
    db.from("orders").select("coupon_id").eq("store_id", storeId).not("coupon_id", "is", null).or(orderUsed(now)).limit(20000),
    db.from("bookings").select("coupon_id").eq("store_id", storeId).not("coupon_id", "is", null).or(bookingUsed(now)).limit(20000),
  ]);
  const counts = new Map<string, number>();
  for (const r of [...(orders ?? []), ...(bookings ?? [])] as { coupon_id: string }[]) counts.set(r.coupon_id, (counts.get(r.coupon_id) ?? 0) + 1);
  return counts;
}

// Resultado de cada cupom desde sempre (pedidos pagos e agendamentos atendidos ou confirmados), por código.
export async function couponResults(db: SupabaseClient, storeId: string) {
  const [{ data: orders }, { data: bookings }] = await Promise.all([
    db.from("orders").select("coupon_code, coupon_discount_cents, total_cents").eq("store_id", storeId).in("status", ["paid", "preparing", "shipped", "delivered"]).not("coupon_code", "is", null).limit(20000),
    db.from("bookings").select("coupon_code, coupon_discount_cents, price_cents").eq("store_id", storeId).in("status", ["completed", "confirmed"]).not("coupon_code", "is", null).limit(20000),
  ]);
  const rows = [
    ...((orders ?? []) as { coupon_code: string; coupon_discount_cents: number; total_cents: number }[]).map((o) => ({ code: o.coupon_code, salesCents: o.total_cents, discountCents: o.coupon_discount_cents })),
    ...((bookings ?? []) as { coupon_code: string; coupon_discount_cents: number; price_cents: number }[]).map((b) => ({ code: b.coupon_code, salesCents: b.price_cents, discountCents: b.coupon_discount_cents })),
  ];
  return new Map(couponSummary(rows).map((r) => [r.code, r]));
}

// Cupom de um pedido, lido à parte: sem as colunas (SQL 20261120100000), o pedido aparece sem cupom.
export async function orderCoupon(db: SupabaseClient, orderId: string, table: "orders" | "bookings" = "orders"): Promise<OrderCoupon> {
  const { data } = await db.from(table).select("coupon_code, coupon_discount_cents").eq("id", orderId).maybeSingle();
  const r = data as { coupon_code: string | null; coupon_discount_cents: number } | null;
  return r?.coupon_code && r.coupon_discount_cents > 0 ? { code: r.coupon_code, cents: r.coupon_discount_cents } : null;
}

// A loja tem cupom ativo que vale aqui? (para mostrar o campo de cupom só quando faz sentido)
export async function hasActiveCoupons(db: SupabaseClient, storeId: string, target: CouponTarget) {
  const { data } = await selectCoupons((fields) => db.from("coupons").select(fields).eq("store_id", storeId).eq("active", true).limit(200));
  const now = new Date();
  return ((data ?? []) as Coupon[]).some((c) => (c.applies_to ?? "all") !== (target === "products" ? "services" : "products") && (!c.ends_at || new Date(c.ends_at) > now));
}

export type AppliedCoupon = { id: string; code: string; label: string; discountCents: number };

// Confere o cupom para um valor (produtos do carrinho, serviço ou pacote). Sem CPF nem celular (no resumo do
// checkout), a regra de 1 uso por cliente fica para a criação do pedido. Sem a tabela, responde como inexistente.
export async function applyCoupon(
  db: SupabaseClient,
  storeId: string,
  rawCode: unknown,
  amountCents: number,
  who: CouponCustomer = {},
  target: CouponTarget = "products",
): Promise<{ ok: true; coupon: AppliedCoupon } | { ok: false; error: string }> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: "Cupom inválido." };
  const { data } = await selectCoupons((fields) => db.from("coupons").select(fields).eq("store_id", storeId).eq("code", code).maybeSingle());
  const coupon = data as Coupon | null;
  if (!coupon) return { ok: false, error: "Cupom não encontrado. Confira se digitou certo." };
  const problem = couponProblem(coupon, amountCents, new Date(), await couponUses(db, coupon.id, who), target);
  if (problem) return { ok: false, error: problem };
  const discountCents = couponDiscountCents(coupon, amountCents);
  return { ok: true, coupon: { id: coupon.id, code: coupon.code, label: couponLabel(coupon), discountCents } };
}
