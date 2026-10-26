import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOLD_STATUSES } from "@/lib/order-status";
import { FEE_FIELDS, paymentFees } from "@/lib/payments/fees";
import { PAYMENT_LINK_METHOD } from "@/lib/payment-links";
import { isCounterSale } from "@/lib/counter";
import { daysSince } from "@/lib/customers";
import { loadStoreCustomers } from "@/lib/customers-server";
import { buildReport, monthOf, previousMonth } from "@/lib/monthly-report";
import { sendMonthlyReport } from "@/lib/email";
import { todayBR } from "@/lib/billing";
import { chunks, fetchAll } from "@/lib/supabase/fetch-all";

const AWAY_DAYS = 60;

type Month = ReturnType<typeof monthOf>;

// Números de uma loja num mês (service role, sempre filtrando store_id).
export async function storeMonthReport(db: SupabaseClient, storeId: string, m: Month, now = new Date()) {
  const [y, mo] = m.month.split("-").map(Number);
  const prev = mo === 1 ? monthOf(y - 1, 12) : monthOf(y, mo - 1);
  // Tudo em páginas de 1000 e lotes de IDs; erro de consulta derruba o resumo desta loja (tenta de novo amanhã),
  // em vez de mandar números incompletos.
  type Sold = { id: string; total_cents: number; paid_at: string; shipping_method: string };
  const [sold, prevOrders, bookings, customers, { data: optedOut }] = await Promise.all([
    fetchAll<Sold>((from, to) => db.from("orders").select("id, total_cents, paid_at, shipping_method").eq("store_id", storeId).in("status", SOLD_STATUSES).gte("paid_at", m.from).lt("paid_at", m.to).order("id").range(from, to)),
    fetchAll<{ total_cents: number }>((from, to) => db.from("orders").select("total_cents").eq("store_id", storeId).in("status", SOLD_STATUSES).gte("paid_at", prev.from).lt("paid_at", prev.to).order("id").range(from, to)),
    fetchAll<{ status: string }>((from, to) =>
      db.from("bookings").select("status").eq("store_id", storeId).in("status", ["completed", "confirmed", "no_show", "canceled"]).gte("starts_at", m.from).lt("starts_at", m.to).order("id").range(from, to),
    ).catch(() => [] as { status: string }[]), // sem a agenda
    loadStoreCustomers(db, storeId, now),
    db.from("customer_contacts").select("customer_key").eq("store_id", storeId).eq("do_not_contact", true),
  ]);
  const productIds = sold.filter((o) => o.shipping_method !== PAYMENT_LINK_METHOD).map((o) => o.id);
  const items: { product_name: string; unit_price_cents: number; quantity: number }[] = [];
  for (const ids of chunks(productIds)) {
    const { data, error } = await db.from("order_items").select("product_name, unit_price_cents, quantity").eq("store_id", storeId).in("order_id", ids);
    if (error) throw new Error(error.message);
    items.push(...(data ?? []));
  }
  // Uma taxa por pedido (o pagamento aprovado dele).
  const feeByOrder = new Map<string, { feeCents: number; netCents: number }>();
  for (const ids of chunks(sold.map((o) => o.id))) {
    const { data, error } = await db.from("payments").select(`order_id, amount_cents, ${FEE_FIELDS}`).eq("store_id", storeId).eq("status", "approved").in("order_id", ids);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as unknown as { order_id: string; amount_cents: number; fee: unknown; net: unknown }[]) {
      const f = paymentFees(p.amount_cents, p.fee, p.net);
      if (f && !feeByOrder.has(p.order_id)) feeByOrder.set(p.order_id, f);
    }
  }
  // Venda no balcão não passa pelo Mercado Pago: sem taxa, o valor inteiro é do lojista.
  for (const o of sold) if (isCounterSale(o.shipping_method)) feeByOrder.set(o.id, { feeCents: 0, netCents: o.total_cents });
  const skip = new Set(((optedOut ?? []) as { customer_key: string }[]).map((c) => c.customer_key));
  return buildReport({
    orders: sold,
    items,
    fees: [...feeByOrder.values()],
    previousSalesCents: prevOrders.reduce((s, o) => s + o.total_cents, 0),
    bookings,
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
