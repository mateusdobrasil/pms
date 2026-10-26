import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOLD_STATUSES } from "@/lib/order-status";
import { type Activity, groupCustomers } from "@/lib/customers";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { type LoyaltyConfig, isStamp } from "@/lib/loyalty";

const HISTORY_DAYS = 730; // 2 anos de pedidos e atendimentos

type OrderRow = { customer_name: string; customer_email: string; customer_phone: string | null; total_cents: number; paid_at: string };
type BookingRow = { customer_name: string; customer_email: string | null; customer_phone: string | null; price_cents: number; starts_at: string; status: string };

// Clientes da loja (pedidos pagos + atendimentos dos últimos 2 anos, e horários futuros marcados).
// Painel → Clientes (cliente do painel, RLS) e resumo do mês (service role). Lê tudo, em páginas de 1000.
// Sem a agenda (SQL não rodado), segue só com os pedidos.
// Com o cartão fidelidade ligado (loyalty), cada cliente vem também com os carimbos.
export async function loadStoreCustomers(db: SupabaseClient, storeId: string, now = new Date(), loyalty: LoyaltyConfig | null = null) {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const nowIso = now.toISOString();
  const orBooking = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [orders, past, upcoming] = await Promise.all([
    fetchAll<OrderRow>((from, to) =>
      db.from("orders").select("customer_name, customer_email, customer_phone, total_cents, paid_at").eq("store_id", storeId).in("status", SOLD_STATUSES).gte("paid_at", since).order("paid_at").order("id").range(from, to),
    ),
    // Atendimentos: marcados como atendidos, ou confirmados com horário que já passou.
    orBooking(
      fetchAll<BookingRow>((from, to) =>
        db
          .from("bookings")
          .select("customer_name, customer_email, customer_phone, price_cents, starts_at, status")
          .eq("store_id", storeId)
          .in("status", ["completed", "confirmed"])
          .gte("starts_at", since)
          .lt("starts_at", nowIso)
          .order("starts_at")
          .order("id")
          .range(from, to),
      ),
    ),
    orBooking(
      fetchAll<{ customer_email: string | null; customer_phone: string | null; starts_at: string }>((from, to) =>
        db.from("bookings").select("customer_email, customer_phone, starts_at").eq("store_id", storeId).in("status", ["confirmed", "pending_payment"]).gte("starts_at", nowIso).order("starts_at").order("id").range(from, to),
      ),
    ),
  ]);
  const activities: Activity[] = [
    ...orders.map((o) => {
      const a = { kind: "order" as const, name: o.customer_name, phone: o.customer_phone, email: o.customer_email, at: o.paid_at, cents: o.total_cents };
      return { ...a, stamp: !!loyalty && isStamp(loyalty, a) };
    }),
    ...past.map((b) => {
      const a = { kind: "booking" as const, name: b.customer_name, phone: b.customer_phone, email: b.customer_email, at: b.starts_at, cents: b.price_cents };
      return { ...a, stamp: !!loyalty && isStamp(loyalty, { ...a, status: b.status }) };
    }),
  ];
  return groupCustomers(
    activities,
    upcoming.map((u) => ({ phone: u.customer_phone, email: u.customer_email, at: u.starts_at })),
  );
}
