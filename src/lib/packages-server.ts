import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/customers";
import { loyaltyKey } from "@/lib/loyalty-data";
import { professionalPercent } from "@/lib/commission-server";
import { type CustomerPackageRow, expiresAt, packageState, pickPackage, remaining } from "@/lib/packages";

export type CustomerPackage = CustomerPackageRow & {
  name: string;
  service_name: string;
  price_cents: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_key: string;
  created_at: string;
};

const FIELDS = "id, service_id, sessions_total, status, expires_at, name, service_name, price_cents, customer_name, customer_phone, customer_email, customer_key, created_at, package_uses(count)";

type Raw = Omit<CustomerPackage, "used"> & { package_uses: { count: number }[] };
const withUsed = (rows: Raw[]): CustomerPackage[] => rows.map(({ package_uses, ...p }) => ({ ...p, used: package_uses?.[0]?.count ?? 0 }));

// Pacotes da loja (todos ou de um cliente, pelo celular/e-mail), com as sessões usadas.
export async function loadCustomerPackages(db: SupabaseClient, storeId: string, keys?: string[]) {
  let q = db.from("customer_packages").select(FIELDS).eq("store_id", storeId).order("created_at", { ascending: false }).limit(1000);
  if (keys) {
    if (!keys.length) return [];
    q = q.in("customer_key", keys);
  }
  const { data, error } = await q;
  if (error) return []; // sem o SQL dos pacotes
  return withUsed((data ?? []) as unknown as Raw[]);
}

// Chaves do cliente de um agendamento (celular e e-mail), para achar os pacotes dele.
export const customerKeys = (phone: string | null | undefined, email: string | null | undefined) =>
  [normalizePhone(phone), email?.trim().toLowerCase() || null].filter((k): k is string => !!k);

// Pacote ativo do cliente para o serviço do agendamento (o que vence primeiro), ou null.
export async function packageForBooking(db: SupabaseClient, storeId: string, b: { service_id: string | null; customer_phone: string | null; customer_email: string | null }) {
  return pickPackage(await loadCustomerPackages(db, storeId, customerKeys(b.customer_phone, b.customer_email)), b.service_id);
}

// Venda de pacote no balcão: cria um pacote por unidade vendida, já ativo (o pagamento foi na hora).
export async function createCustomerPackages(
  db: SupabaseClient,
  storeId: string,
  orderId: string,
  customer: { name: string; phone: string | null; email: string | null },
  sold: { packageId: string; quantity: number }[],
) {
  const key = loyaltyKey(customer.phone, customer.email);
  if (!key || !sold.length) return [];
  const { data: models } = await db.from("service_packages").select("id, service_id, name, sessions, price_cents, validity_days, services(name)").eq("store_id", storeId).in("id", sold.map((s) => s.packageId));
  const rows = sold.flatMap((s) => {
    const m = (models ?? []).find((x) => x.id === s.packageId) as unknown as { id: string; service_id: string; name: string; sessions: number; price_cents: number; validity_days: number | null; services: { name: string } | null } | undefined;
    if (!m) return [];
    return Array.from({ length: s.quantity }, () => ({
      store_id: storeId,
      package_id: m.id,
      service_id: m.service_id,
      name: m.name,
      service_name: m.services?.name ?? m.name,
      sessions_total: m.sessions,
      price_cents: m.price_cents,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_email: customer.email || null,
      customer_key: key,
      order_id: orderId,
      expires_at: expiresAt(m.validity_days),
    }));
  });
  if (!rows.length) return [];
  const { data, error } = await db.from("customer_packages").insert(rows).select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

type UseInput = { customerPackageId: string; bookingId?: string | null; professionalId?: string | null };

// Usa uma sessão: num agendamento (marca como atendido, com a comissão) ou no balcão (com quem atendeu).
// Devolve as sessões que sobraram.
export async function redeemPackageSession(db: SupabaseClient, storeId: string, input: UseInput): Promise<{ ok: true; left: number; bookingCompleted: boolean } | { ok: false; error: string }> {
  const [pkg] = withUsed(((await db.from("customer_packages").select(FIELDS).eq("store_id", storeId).eq("id", input.customerPackageId)).data ?? []) as unknown as Raw[]);
  if (!pkg) return { ok: false, error: "Pacote não encontrado." };
  const state = packageState(pkg);
  if (state !== "active") return { ok: false, error: state === "used_up" ? "Este pacote já usou todas as sessões." : state === "expired" ? "Este pacote venceu." : "Este pacote foi cancelado." };

  let professionalId = input.professionalId ?? null;
  let bookingCompleted = false;
  let priceCents = 0;
  if (input.bookingId) {
    const { data: b } = await db.from("bookings").select("id, status, service_id, professional_id, price_cents").eq("id", input.bookingId).eq("store_id", storeId).maybeSingle();
    if (!b || (b.status !== "confirmed" && b.status !== "completed")) return { ok: false, error: "Agendamento não encontrado ou não confirmado." };
    if (b.service_id !== pkg.service_id) return { ok: false, error: "O pacote é de outro serviço." };
    professionalId = b.professional_id;
    priceCents = b.price_cents;
  } else {
    const { data: s } = await db.from("services").select("price_cents").eq("id", pkg.service_id ?? "").maybeSingle();
    priceCents = s?.price_cents ?? 0;
  }
  const { data: pro } = professionalId ? await db.from("professionals").select("id, name").eq("id", professionalId).eq("store_id", storeId).maybeSingle() : { data: null };
  if (!input.bookingId && !pro) return { ok: false, error: "Escolha quem atendeu." };
  const pct = pro ? await professionalPercent(db, pro.id, pkg.service_id) : null;

  const { error } = await db.from("package_uses").insert({
    store_id: storeId,
    customer_package_id: pkg.id,
    booking_id: input.bookingId ?? null,
    professional_id: pro?.id ?? null,
    professional_name: pro?.name ?? null,
    price_cents: priceCents,
    commission_percent: input.bookingId ? null : (pct ?? null), // no agendamento, a comissão vem do agendamento
  });
  if (error?.code === "23505") return { ok: false, error: "Este agendamento já usou uma sessão do pacote." };
  if (error) throw error;

  if (input.bookingId) {
    const { data: upd } = await db
      .from("bookings")
      .update({ status: "completed", ...(pct !== undefined ? { commission_percent: pct } : {}) })
      .eq("id", input.bookingId)
      .eq("status", "confirmed")
      .select("id");
    bookingCompleted = !!upd?.length;
  }
  return { ok: true, left: remaining({ ...pkg, used: pkg.used + 1 }), bookingCompleted };
}

export async function cancelCustomerPackage(db: SupabaseClient, storeId: string, id: string) {
  const { data } = await db.from("customer_packages").update({ status: "canceled" }).eq("store_id", storeId).eq("id", id).eq("status", "active").select("id");
  return !!data?.length;
}
