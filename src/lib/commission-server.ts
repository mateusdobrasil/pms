import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type CommissionBooking, type CommissionRates, buildCommissions, effectivePercent } from "@/lib/commission";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { SOLD_STATUSES } from "@/lib/order-status";

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

  // Atendimentos sem horário vendidos no balcão: itens de serviço da venda, com o percentual gravado na venda
  // (o recebimento de um agendamento fica de fora: a comissão dele vem do agendamento). SQL 20261115000000.
  type WalkIn = { id: string; professional_id: string; professional_name: string | null; service_id: string | null; product_name: string; unit_price_cents: number; quantity: number; commission_percent: number | null; orders: { paid_at: string; customer_name: string } };
  const walkIns = await fetchAll<WalkIn>(
    ((a: number, b: number) =>
      db
        .from("order_items")
        .select("id, professional_id, professional_name, service_id, product_name, unit_price_cents, quantity, commission_percent, orders!inner(paid_at, customer_name, status)")
        .eq("store_id", storeId)
        .not("professional_id", "is", null)
        .is("booking_id", null)
        .in("orders.status", SOLD_STATUSES)
        .gte("orders.paid_at", from)
        .lt("orders.paid_at", to)
        .order("id")
        .range(a, b)) as never,
  ).catch(() => [] as WalkIn[]);
  for (const w of walkIns) {
    bookings.push({
      id: w.id,
      professional_id: w.professional_id,
      professional_name: w.professional_name ?? "",
      service_id: w.service_id,
      service_name: `${w.product_name} (balcão)`,
      customer_name: w.orders.customer_name,
      starts_at: w.orders.paid_at,
      status: "completed",
      price_cents: w.unit_price_cents * w.quantity,
      commission_percent: w.commission_percent,
    });
  }

  // Sessões de pacote usadas no balcão (sem agendamento), com quem atendeu e o percentual gravado no uso.
  // As usadas num agendamento já entram pelo agendamento. SQL 20261116000000.
  type PackageUse = { id: string; professional_id: string | null; professional_name: string | null; price_cents: number; commission_percent: number | null; used_at: string; customer_packages: { service_id: string | null; service_name: string; customer_name: string } };
  const { data: uses } = await db
    .from("package_uses")
    .select("id, professional_id, professional_name, price_cents, commission_percent, used_at, customer_packages!inner(service_id, service_name, customer_name)")
    .eq("store_id", storeId)
    .is("booking_id", null)
    .not("professional_id", "is", null)
    .gte("used_at", from)
    .lt("used_at", to)
    .limit(5000);
  for (const u of (uses ?? []) as unknown as PackageUse[]) {
    bookings.push({
      id: u.id,
      professional_id: u.professional_id,
      professional_name: u.professional_name ?? "",
      service_id: u.customer_packages.service_id,
      service_name: `${u.customer_packages.service_name} (pacote)`,
      customer_name: u.customer_packages.customer_name,
      starts_at: u.used_at,
      status: "completed",
      price_cents: u.price_cents,
      commission_percent: u.commission_percent,
    });
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

// Percentual do profissional para um serviço (o próprio do serviço, senão o geral; null = sem comissão definida).
// undefined = colunas da comissão ainda não existem (SQL 20261112000000): quem chama segue sem gravar.
export async function professionalPercent(db: SupabaseClient, professionalId: string, serviceId: string | null) {
  const [{ data: pro, error }, { data: ps }] = await Promise.all([
    db.from("professionals").select("commission_percent").eq("id", professionalId).maybeSingle(),
    serviceId
      ? db.from("professional_services").select("commission_percent").eq("professional_id", professionalId).eq("service_id", serviceId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) return undefined;
  return effectivePercent(
    (pro as { commission_percent: number | null } | null)?.commission_percent ?? null,
    (ps as { commission_percent: number | null } | null)?.commission_percent ?? null,
  );
}

// Percentual do atendimento de um agendamento (gravado ao marcar "atendido" ou ao receber no balcão).
export async function bookingCommissionPercent(db: SupabaseClient, bookingId: string) {
  const { data: b } = await db.from("bookings").select("professional_id, service_id").eq("id", bookingId).single();
  if (!b?.professional_id) return null;
  return professionalPercent(db, b.professional_id, b.service_id);
}
