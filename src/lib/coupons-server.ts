import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Coupon, type OrderCoupon, couponDiscountCents, couponLabel, couponProblem, normalizeCouponCode } from "@/lib/coupons";

export const COUPON_FIELDS = "id, code, kind, value, min_subtotal_cents, starts_at, ends_at, max_uses, once_per_customer, active";

// Pedidos que contam como uso: pagos (inclui enviados/entregues) e os ainda aguardando pagamento no prazo
// (reservam o uso por até 1 h; expirado ou cancelado devolve).
function usedFilter(now: Date) {
  return `status.in.(paid,preparing,shipped,delivered),and(status.eq.pending_payment,expires_at.gt.${now.toISOString()})`;
}

export async function couponUses(db: SupabaseClient, couponId: string, cpf?: string | null, now = new Date()) {
  const count = (byCpf: boolean) => {
    let q = db.from("orders").select("id", { count: "exact", head: true }).eq("coupon_id", couponId).or(usedFilter(now));
    if (byCpf) q = q.eq("customer_cpf", cpf);
    return q;
  };
  const [{ count: total }, byCustomer] = await Promise.all([count(false), cpf ? count(true) : Promise.resolve({ count: 0 })]);
  return { total: total ?? 0, byCustomer: byCustomer.count ?? 0 };
}

// Usos por cupom, para a lista do painel (só pedidos pagos e reservas no prazo).
export async function couponUseCounts(db: SupabaseClient, storeId: string, now = new Date()) {
  const { data } = await db.from("orders").select("coupon_id").eq("store_id", storeId).not("coupon_id", "is", null).or(usedFilter(now)).limit(20000);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { coupon_id: string }[]) counts.set(r.coupon_id, (counts.get(r.coupon_id) ?? 0) + 1);
  return counts;
}

// Cupom de um pedido, lido à parte: sem as colunas (SQL 20261120100000), o pedido aparece sem cupom.
export async function orderCoupon(db: SupabaseClient, orderId: string): Promise<OrderCoupon> {
  const { data } = await db.from("orders").select("coupon_code, coupon_discount_cents").eq("id", orderId).maybeSingle();
  const r = data as { coupon_code: string | null; coupon_discount_cents: number } | null;
  return r?.coupon_code && r.coupon_discount_cents > 0 ? { code: r.coupon_code, cents: r.coupon_discount_cents } : null;
}

export type AppliedCoupon = { id: string; code: string; label: string; discountCents: number };

// Confere o cupom para um carrinho. Sem CPF (no resumo do checkout), a regra de 1 uso por cliente fica para a
// criação do pedido. Sem a tabela (SQL não rodado), responde como cupom inexistente.
export async function applyCoupon(
  db: SupabaseClient,
  storeId: string,
  rawCode: unknown,
  subtotalCents: number,
  cpf?: string | null,
): Promise<{ ok: true; coupon: AppliedCoupon } | { ok: false; error: string }> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: "Cupom inválido." };
  const { data } = await db.from("coupons").select(COUPON_FIELDS).eq("store_id", storeId).eq("code", code).maybeSingle();
  const coupon = data as Coupon | null;
  if (!coupon) return { ok: false, error: "Cupom não encontrado. Confira se digitou certo." };
  const problem = couponProblem(coupon, subtotalCents, new Date(), await couponUses(db, coupon.id, cpf));
  if (problem) return { ok: false, error: problem };
  const discountCents = couponDiscountCents(coupon, subtotalCents);
  return { ok: true, coupon: { id: coupon.id, code: coupon.code, label: couponLabel(coupon), discountCents } };
}
