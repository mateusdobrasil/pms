import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOLD_STATUSES } from "@/lib/order-status";
import { FEE_FIELDS, paymentFees } from "@/lib/payments/fees";
import { PAYMENT_LINK_METHOD } from "@/lib/payment-links";
import { daysSince } from "@/lib/customers";
import { loadStoreCustomers } from "@/lib/customers-server";
import { buildReport, monthOf, previousMonth } from "@/lib/monthly-report";
import { sendMonthlyReport } from "@/lib/email";
import { todayBR } from "@/lib/billing";

const AWAY_DAYS = 60;

type Month = ReturnType<typeof monthOf>;

// Números de uma loja num mês (service role, sempre filtrando store_id).
export async function storeMonthReport(db: SupabaseClient, storeId: string, m: Month, now = new Date()) {
  const [y, mo] = m.month.split("-").map(Number);
  const prev = mo === 1 ? monthOf(y - 1, 12) : monthOf(y, mo - 1);
  const [{ data: orders }, { data: prevOrders }, { data: bookings }, customers, { data: optedOut }] = await Promise.all([
    db.from("orders").select("id, total_cents, paid_at, shipping_method").eq("store_id", storeId).in("status", SOLD_STATUSES).gte("paid_at", m.from).lt("paid_at", m.to),
    db.from("orders").select("total_cents").eq("store_id", storeId).in("status", SOLD_STATUSES).gte("paid_at", prev.from).lt("paid_at", prev.to),
    db.from("bookings").select("status").eq("store_id", storeId).in("status", ["completed", "confirmed", "no_show", "canceled"]).gte("starts_at", m.from).lt("starts_at", m.to),
    loadStoreCustomers(db, storeId, now),
    db.from("customer_contacts").select("customer_key").eq("store_id", storeId).eq("do_not_contact", true),
  ]);
  const sold = (orders ?? []) as { id: string; total_cents: number; paid_at: string; shipping_method: string }[];
  const ids = sold.map((o) => o.id);
  const productIds = sold.filter((o) => o.shipping_method !== PAYMENT_LINK_METHOD).map((o) => o.id);
  const [{ data: items }, { data: payments }] = await Promise.all([
    productIds.length
      ? db.from("order_items").select("product_name, unit_price_cents, quantity").eq("store_id", storeId).in("order_id", productIds)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.from("payments").select(`order_id, amount_cents, ${FEE_FIELDS}`).eq("store_id", storeId).eq("status", "approved").in("order_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  // Uma taxa por pedido (o pagamento aprovado dele).
  const feeByOrder = new Map<string, { feeCents: number; netCents: number }>();
  for (const p of (payments ?? []) as unknown as { order_id: string; amount_cents: number; fee: unknown; net: unknown }[]) {
    const f = paymentFees(p.amount_cents, p.fee, p.net);
    if (f && !feeByOrder.has(p.order_id)) feeByOrder.set(p.order_id, f);
  }
  const skip = new Set(((optedOut ?? []) as { customer_key: string }[]).map((c) => c.customer_key));
  return buildReport({
    orders: sold,
    items: (items ?? []) as { product_name: string; unit_price_cents: number; quantity: number }[],
    fees: [...feeByOrder.values()],
    previousSalesCents: ((prevOrders ?? []) as { total_cents: number }[]).reduce((s, o) => s + o.total_cents, 0),
    bookings: (bookings ?? []) as { status: string }[],
    newCustomers: customers.filter((c) => c.firstAt >= m.from && c.firstAt < m.to).length,
    awayCustomers: customers.filter((c) => daysSince(c.lastAt, now) >= AWAY_DAYS && !c.nextBookingAt && !skip.has(c.key)).length,
  });
}

// Rotina dos dias 1 a 3: um resumo do mês anterior por loja ativa (a trava em store_monthly_reports evita repetir).
// Loja sem nenhum movimento no mês não recebe (nada a contar), mas fica marcada para não ser recalculada.
export async function runMonthlyReports(db: SupabaseClient, today = todayBR()) {
  const m = previousMonth(today);
  const { data: stores, error } = await db.from("stores").select("id").eq("status", "active");
  if (error) throw new Error(error.message);
  let sent = 0, quiet = 0, failed = 0;
  for (const s of stores ?? []) {
    const { error: claimErr } = await db.from("store_monthly_reports").insert({ store_id: s.id, month: m.month });
    if (claimErr) continue; // já enviado (23505) ou tabela ausente
    try {
      const report = await storeMonthReport(db, s.id, m);
      if (!report.hasActivity) {
        quiet++;
        continue;
      }
      if (await sendMonthlyReport(s.id, m, report)) sent++;
      else throw new Error("e-mail não enviado");
    } catch (err) {
      failed++;
      console.error("Resumo do mês não enviado", { storeId: s.id, err });
      await db.from("store_monthly_reports").delete().eq("store_id", s.id).eq("month", m.month); // tenta de novo amanhã
    }
  }
  return { month: m.month, sent, quiet, failed };
}
