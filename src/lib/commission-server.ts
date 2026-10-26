import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type CommissionBooking, type CommissionRates, buildCommissions } from "@/lib/commission";
import { fetchAll } from "@/lib/supabase/fetch-all";

const FIELDS = "id, professional_id, professional_name, service_id, service_name, customer_name, starts_at, status, price_cents";

// Comissões do período (tela Agenda → Comissões e planilha). Sem as colunas de comissão (SQL 20261112000000),
// segue com o percentual vazio: os atendimentos aparecem, sem valor de comissão.
export async function loadCommissions(db: SupabaseClient, storeId: string, from: string, to: string) {
  const page = (fields: string) => (a: number, b: number) =>
    db.from("bookings").select(fields).eq("store_id", storeId).in("status", ["completed", "confirmed"]).gte("starts_at", from).lt("starts_at", to).order("starts_at").order("id").range(a, b);
  let bookings: CommissionBooking[];
  let hasColumns = true;
  try {
    bookings = await fetchAll<CommissionBooking>(page(`${FIELDS}, commission_percent`) as never);
  } catch {
    hasColumns = false;
    bookings = (await fetchAll<Omit<CommissionBooking, "commission_percent">>(page(FIELDS) as never)).map((b) => ({ ...b, commission_percent: null }));
  }

  const rates: CommissionRates = new Map();
  if (hasColumns) {
    const [{ data: pros }, { data: ps }] = await Promise.all([
      db.from("professionals").select("id, commission_percent").eq("store_id", storeId),
      db.from("professional_services").select("professional_id, service_id, commission_percent").eq("store_id", storeId),
    ]);
    for (const p of (pros ?? []) as { id: string; commission_percent: number | null }[]) rates.set(p.id, { general: p.commission_percent, perService: new Map() });
    for (const s of (ps ?? []) as { professional_id: string; service_id: string; commission_percent: number | null }[]) {
      rates.get(s.professional_id)?.perService.set(s.service_id, s.commission_percent);
    }
  }
  return { professionals: buildCommissions(bookings, rates), hasColumns };
}
