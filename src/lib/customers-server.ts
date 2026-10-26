import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOLD_STATUSES } from "@/lib/order-status";
import { type Activity, groupCustomers } from "@/lib/customers";

const HISTORY_DAYS = 730; // 2 anos de pedidos e atendimentos

type OrderRow = { customer_name: string; customer_email: string; customer_phone: string | null; total_cents: number; paid_at: string };
type BookingRow = { customer_name: string; customer_email: string | null; customer_phone: string | null; price_cents: number; starts_at: string };

// Clientes da loja (pedidos pagos + atendimentos dos últimos 2 anos, e horários futuros marcados).
// Painel → Clientes (cliente do painel, RLS) e resumo do mês (service role). Sem a agenda, só os pedidos.
export async function loadStoreCustomers(db: SupabaseClient, storeId: string, now = new Date()) {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const nowIso = now.toISOString();
  const [{ data: orders }, { data: past }, { data: upcoming }] = await Promise.all([
    db.from("orders").select("customer_name, customer_email, customer_phone, total_cents, paid_at").eq("store_id", storeId).in("status", SOLD_STATUSES).gte("paid_at", since).limit(5000),
    // Atendimentos: marcados como atendidos, ou confirmados com horário que já passou.
    db
      .from("bookings")
      .select("customer_name, customer_email, customer_phone, price_cents, starts_at")
      .eq("store_id", storeId)
      .in("status", ["completed", "confirmed"])
      .gte("starts_at", since)
      .lt("starts_at", nowIso)
      .limit(5000),
    db.from("bookings").select("customer_email, customer_phone, starts_at").eq("store_id", storeId).in("status", ["confirmed", "pending_payment"]).gte("starts_at", nowIso).limit(2000),
  ]);
  const activities: Activity[] = [
    ...((orders ?? []) as OrderRow[]).map((o) => ({ kind: "order" as const, name: o.customer_name, phone: o.customer_phone, email: o.customer_email, at: o.paid_at, cents: o.total_cents })),
    ...((past ?? []) as BookingRow[]).map((b) => ({ kind: "booking" as const, name: b.customer_name, phone: b.customer_phone, email: b.customer_email, at: b.starts_at, cents: b.price_cents })),
  ];
  return groupCustomers(
    activities,
    ((upcoming ?? []) as { customer_email: string | null; customer_phone: string | null; starts_at: string }[]).map((u) => ({ phone: u.customer_phone, email: u.customer_email, at: u.starts_at })),
  );
}
