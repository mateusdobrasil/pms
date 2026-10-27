import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/customers";
import { loyaltyKey } from "@/lib/loyalty-data";
import { professionalPercent } from "@/lib/commission-server";
import { type CustomerPackageRow, PACKAGE_METHOD, expiresAt, packageState, pickPackage, remaining } from "@/lib/packages";
import { ORDER_TTL_MINUTES, parseCustomer } from "@/lib/orders";
import { type AppliedCoupon, applyCoupon } from "@/lib/coupons-server";

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

// Pacotes vendidos (no balcão, na hora; online, quando o pagamento confirma): um por unidade, já ativos.
// Idempotente: (venda, pacote, seq) é único, então ativar de novo não duplica. Devolve só os criados agora.
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
    return Array.from({ length: s.quantity }, (_, i) => ({
      seq: i + 1,
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
  const opts = { onConflict: "order_id,package_id,seq", ignoreDuplicates: true };
  let { data, error } = await db.from("customer_packages").upsert(rows, opts).select("id");
  // Sem o SQL 20261117000000 (sem seq e sem o índice): grava como antes (só o balcão usa).
  if (error && /seq|no unique|ON CONFLICT/i.test(error.message)) ({ data, error } = await db.from("customer_packages").insert(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "seq")))).select("id"));
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

// Compra online paga: ativa os pacotes da venda (itens com package_id). Chamado depois da confirmação do pagamento.
export async function activatePackagesForOrder(db: SupabaseClient, orderId: string) {
  const { data: o } = await db.from("orders").select("id, store_id, status, customer_name, customer_phone, customer_email").eq("id", orderId).maybeSingle();
  if (!o || !["paid", "preparing", "shipped", "delivered"].includes(o.status)) return [];
  const { data: items } = await db.from("order_items").select("package_id, quantity").eq("order_id", orderId).not("package_id", "is", null);
  if (!items?.length) return [];
  return createCustomerPackages(
    db,
    o.store_id,
    o.id,
    { name: o.customer_name, phone: normalizePhone(o.customer_phone), email: o.customer_email },
    (items as { package_id: string; quantity: number }[]).map((i) => ({ packageId: i.package_id, quantity: i.quantity })),
  );
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

// Compra online do pacote (loja/pacotes/<id>): cria o pedido (aguardando pagamento) com o preço do banco.
// O pacote só é ativado quando o pagamento confirma (activatePackagesForOrder, chamado em recordPayment).
export async function createPackageOrder(db: SupabaseClient, storeId: string, packageId: string, body: unknown): Promise<{ ok: true; token: string } | { ok: false; errors: string[]; status?: number }> {
  const { data: m } = await db.from("service_packages").select("id, name, price_cents, active").eq("store_id", storeId).eq("id", packageId).maybeSingle();
  if (!m?.active) return { ok: false, errors: ["Este pacote não está mais à venda."], status: 404 };
  const b = (body ?? {}) as Record<string, unknown>;
  const { customer, errors } = parseCustomer(b.customer);
  if (!customer) return { ok: false, errors };
  // Cupom (conferido aqui, com CPF e celular): sai do preço do pacote, como na loja virtual.
  let coupon: AppliedCoupon | null = null;
  if (b.coupon) {
    const applied = await applyCoupon(db, storeId, b.coupon, m.price_cents, { cpf: customer.cpf, phone: customer.phone }, "services");
    if (!applied.ok) return { ok: false, errors: [`Cupom: ${applied.error} Apague o cupom para continuar sem ele.`] };
    coupon = applied.coupon;
  }
  const couponCents = coupon?.discountCents ?? 0;
  const { data: order, error } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_cpf: customer.cpf,
      customer_phone: customer.phone,
      shipping_address: null,
      shipping_method: PACKAGE_METHOD,
      subtotal_cents: m.price_cents,
      shipping_cents: 0,
      total_cents: m.price_cents - couponCents,
      ...(coupon ? { coupon_id: coupon.id, coupon_code: coupon.code, coupon_discount_cents: couponCents, discount_cents: couponCents } : {}),
      expires_at: new Date(Date.now() + ORDER_TTL_MINUTES * 60_000).toISOString(),
    })
    .select("id, public_token")
    .single();
  if (error) throw error;
  const { error: itemErr } = await db.from("order_items").insert({
    store_id: storeId,
    order_id: order.id,
    variant_id: null,
    product_name: `Pacote: ${m.name}`,
    variant_name: "Único",
    unit_price_cents: m.price_cents,
    quantity: 1,
    package_id: m.id,
  });
  if (itemErr) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemErr;
  }
  return { ok: true, token: order.public_token };
}

// Pacote do cliente que dispensa o sinal no agendamento online: o ativo do serviço (pelo celular) com sessão
// livre, descontando os horários já marcados com ele. Sem pacote, null.
export async function packageForNewBooking(db: SupabaseClient, storeId: string, serviceId: string, phone: string) {
  const key = normalizePhone(phone);
  if (!key) return null;
  const pkg = pickPackage(await loadCustomerPackages(db, storeId, [key]), serviceId);
  if (!pkg) return null;
  const { count } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("customer_package_id", pkg.id)
    .in("status", ["confirmed", "pending_payment"]);
  return remaining(pkg) - (count ?? 0) > 0 ? pkg : null;
}

export type PackageForSale = { id: string; name: string; sessions: number; price_cents: number; validity_days: number | null; service_id: string; service_name: string };

// Pacotes à venda na loja (página loja/pacotes). Sem o SQL dos pacotes, lista vazia.
export async function packagesForSale(db: SupabaseClient, storeId: string): Promise<PackageForSale[]> {
  const { data, error } = await db
    .from("service_packages")
    .select("id, name, sessions, price_cents, validity_days, service_id, services!inner(name, active)")
    .eq("store_id", storeId)
    .eq("active", true)
    .eq("services.active", true)
    .order("price_cents");
  if (error) return [];
  return ((data ?? []) as unknown as (Omit<PackageForSale, "service_name"> & { services: { name: string } })[]).map(({ services, ...p }) => ({ ...p, service_name: services.name }));
}
