import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type PricedLine, parseCartItems, priceCart } from "@/lib/orders";
import { normalizePhone } from "@/lib/customers";
import { isEmail, isUuid } from "@/lib/validation";
import { COUNTER_METHOD, type CounterPayment, counterTotal, isCounterPayment } from "@/lib/counter";
import { professionalPercent } from "@/lib/commission-server";
import { createCustomerPackages } from "@/lib/packages-server";

export type CounterSaleInput = {
  items: unknown; // produtos: [{ variantId, quantity }]
  services?: unknown; // atendimentos sem horário: [{ serviceId, professionalId, quantity }]
  packages?: unknown; // pacotes de sessões: [{ packageId, quantity }] (exige o celular do cliente)
  payment: unknown;
  discountCents: unknown;
  customer?: { name?: unknown; phone?: unknown; email?: unknown };
};

type Result = { ok: true; id: string; code: string; totalCents: number; stockIssue: boolean; packageIds?: string[] } | { ok: false; error: string };

type PackageLine = { packageId: string; name: string; unitPriceCents: number; quantity: number };

// Pacotes da venda com preço do banco.
async function pricePackages(db: SupabaseClient, storeId: string, raw: unknown): Promise<PackageLine[] | string> {
  if (raw == null || (Array.isArray(raw) && raw.length === 0)) return [];
  if (!Array.isArray(raw) || raw.length > 10) return "Pacotes inválidos.";
  const wanted = raw.map((r) => ({ packageId: String(r?.packageId ?? ""), quantity: Number(r?.quantity) }));
  if (wanted.some((w) => !isUuid(w.packageId) || !Number.isInteger(w.quantity) || w.quantity < 1 || w.quantity > 5)) return "Pacotes inválidos.";
  const { data } = await db.from("service_packages").select("id, name, price_cents, active").eq("store_id", storeId).in("id", wanted.map((w) => w.packageId));
  const lines: PackageLine[] = [];
  for (const w of wanted) {
    const p = (data ?? []).find((x) => x.id === w.packageId);
    if (!p?.active) return "Um pacote da venda não está mais à venda.";
    lines.push({ packageId: p.id, name: p.name, unitPriceCents: p.price_cents, quantity: w.quantity });
  }
  return lines;
}

type ServiceLine = { serviceId: string; serviceName: string; professionalId: string; professionalName: string; unitPriceCents: number; quantity: number; commissionPercent: number | null };

const MAX_SERVICE_LINES = 20;

// Serviços da venda com preço do banco (nunca do navegador) e o percentual de comissão de agora.
async function priceServices(db: SupabaseClient, storeId: string, raw: unknown): Promise<ServiceLine[] | string> {
  if (raw == null || (Array.isArray(raw) && raw.length === 0)) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SERVICE_LINES) return "Serviços inválidos.";
  const wanted = raw.map((r) => ({ serviceId: String(r?.serviceId ?? ""), professionalId: String(r?.professionalId ?? ""), quantity: Number(r?.quantity) }));
  if (wanted.some((w) => !isUuid(w.serviceId) || !isUuid(w.professionalId) || !Number.isInteger(w.quantity) || w.quantity < 1 || w.quantity > 20)) {
    return "Escolha o serviço e o profissional.";
  }
  const [{ data: services }, { data: pros }, { data: links }] = await Promise.all([
    db.from("services").select("id, name, price_cents, active").eq("store_id", storeId).in("id", wanted.map((w) => w.serviceId)),
    db.from("professionals").select("id, name").eq("store_id", storeId).in("id", wanted.map((w) => w.professionalId)),
    db.from("professional_services").select("professional_id, service_id").eq("store_id", storeId).in("service_id", wanted.map((w) => w.serviceId)),
  ]);
  const lines: ServiceLine[] = [];
  for (const w of wanted) {
    const s = (services ?? []).find((x) => x.id === w.serviceId);
    const p = (pros ?? []).find((x) => x.id === w.professionalId);
    if (!s || !s.active) return "Um serviço da venda não está mais disponível.";
    if (!p || !(links ?? []).some((l) => l.professional_id === p.id && l.service_id === s.id)) return `${p?.name ?? "O profissional"} não faz ${s.name}.`;
    const pct = await professionalPercent(db, p.id, s.id);
    lines.push({ serviceId: s.id, serviceName: s.name, professionalId: p.id, professionalName: p.name, unitPriceCents: s.price_cents, quantity: w.quantity, commissionPercent: pct ?? null });
  }
  return lines;
}

// Venda presencial de produtos e/ou atendimentos sem horário. Produtos: preços e disponibilidade de
// product_variants (como no checkout); esgotado no sistema ainda pode ser vendido (está na mão do lojista)
// e o pedido fica com o selo "sem estoque". A service role cria o pedido, confirma pela confirm_order_payment
// (baixa o estoque) e já o conclui.
export async function createCounterSale(db: SupabaseClient, storeId: string, input: CounterSaleInput): Promise<Result> {
  const hasProducts = Array.isArray(input.items) && input.items.length > 0;
  const items = hasProducts ? parseCartItems(input.items) : [];
  if (!items) return { ok: false, error: "Produtos inválidos na venda." };
  const services = await priceServices(db, storeId, input.services);
  if (typeof services === "string") return { ok: false, error: services };
  const packages = await pricePackages(db, storeId, input.packages);
  if (typeof packages === "string") return { ok: false, error: packages };
  if (!items.length && !services.length && !packages.length) return { ok: false, error: "Adicione pelo menos um produto, serviço ou pacote." };
  if (!isCounterPayment(input.payment)) return { ok: false, error: "Escolha a forma de pagamento." };
  const payment: CounterPayment = input.payment;

  let lines: PricedLine[] = [];
  let productsCents = 0;
  if (items.length) {
    const priced = await priceCart(db, storeId, items);
    if (priced.lines.length !== items.length) return { ok: false, error: "Um produto da venda não está mais à venda. Confira a lista." };
    lines = priced.lines;
    productsCents = priced.subtotalCents;
  }
  const subtotalCents =
    productsCents + services.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0) + packages.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const rawDiscount = Number(input.discountCents ?? 0);
  if (!Number.isInteger(rawDiscount) || rawDiscount < 0) return { ok: false, error: "Desconto inválido." };
  const { discountCents, totalCents } = counterTotal(subtotalCents, rawDiscount);

  // Cliente opcional: com celular ou e-mail, a venda entra em Clientes e no cartão fidelidade.
  const name = typeof input.customer?.name === "string" ? input.customer.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const phoneRaw = typeof input.customer?.phone === "string" ? input.customer.phone : "";
  const phone = normalizePhone(phoneRaw);
  if (phoneRaw.trim() && !phone) return { ok: false, error: "Celular inválido: use DDD + número." };
  const email = typeof input.customer?.email === "string" ? input.customer.email.trim().toLowerCase() : "";
  if (email && !isEmail(email)) return { ok: false, error: "E-mail do cliente inválido." };
  if (packages.length && !phone) return { ok: false, error: "Para vender pacote, informe o nome e o celular do cliente (o pacote fica no nome dele)." };

  const { data: order, error } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      customer_name: name || "Cliente do balcão",
      customer_email: email,
      customer_cpf: "",
      customer_phone: phone,
      shipping_address: null,
      shipping_method: COUNTER_METHOD,
      subtotal_cents: subtotalCents,
      shipping_cents: 0,
      discount_cents: discountCents,
      total_cents: totalCents,
      counter_payment: payment,
      ...(services.length ? { has_services: true } : {}),
    })
    .select("id, code")
    .single();
  if (error) throw error;

  const { error: itemsErr } = await db.from("order_items").insert([
    ...lines.map((l) => ({
      store_id: storeId,
      order_id: order.id,
      variant_id: l.variantId,
      product_name: l.productName,
      variant_name: l.variantName,
      unit_price_cents: l.unitPriceCents,
      quantity: l.quantity,
    })),
    ...services.map((s) => ({
      store_id: storeId,
      order_id: order.id,
      variant_id: null,
      product_name: s.serviceName,
      variant_name: "Único",
      unit_price_cents: s.unitPriceCents,
      quantity: s.quantity,
      service_id: s.serviceId,
      professional_id: s.professionalId,
      professional_name: s.professionalName,
      commission_percent: s.commissionPercent,
    })),
    ...packages.map((p) => ({
      store_id: storeId,
      order_id: order.id,
      variant_id: null,
      product_name: `Pacote: ${p.name}`,
      variant_name: "Único",
      unit_price_cents: p.unitPriceCents,
      quantity: p.quantity,
      package_id: p.packageId,
    })),
  ]);
  if (itemsErr) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemsErr;
  }
  const result = await confirmAndClose(db, order, totalCents);
  // Pacotes vendidos: ficam ativos no nome do cliente (um por unidade).
  if (result.ok && packages.length) {
    result.packageIds = await createCustomerPackages(db, storeId, order.id, { name: name || "Cliente do balcão", phone, email }, packages.map((p) => ({ packageId: p.packageId, quantity: p.quantity })));
  }
  return result;
}

// Baixa o estoque (marca "sem estoque" se faltar) e já conclui: a venda foi entregue na hora.
async function confirmAndClose(db: SupabaseClient, order: { id: string; code: string }, totalCents: number): Promise<Result> {
  const { error: confirmErr } = await db.rpc("confirm_order_payment", { p_order_id: order.id });
  if (confirmErr) throw confirmErr;
  const { data: done } = await db.from("orders").update({ status: "delivered" }).eq("id", order.id).select("stock_issue").single();
  return { ok: true, id: order.id, code: order.code, totalCents, stockIssue: !!done?.stock_issue };
}

type BookingRow = {
  id: string;
  status: string;
  service_id: string | null;
  service_name: string;
  professional_id: string | null;
  professional_name: string;
  price_cents: number;
  paid_cents: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
};

export type ReceiveResult = (Result & { completedNow?: boolean }) | { ok: true; id: null; code: null; totalCents: 0; stockIssue: false; completedNow: boolean };

// Recebe no balcão o que falta pagar de um agendamento (o valor do serviço menos o pago online) e marca como
// atendido, gravando o percentual de comissão. A venda fica ligada ao agendamento (orders.booking_id, único):
// a comissão e o cartão fidelidade continuam vindo do agendamento.
export async function receiveBooking(db: SupabaseClient, storeId: string, bookingId: string, payment: unknown, discount: unknown): Promise<ReceiveResult> {
  const { data } = await db
    .from("bookings")
    .select("id, status, service_id, service_name, professional_id, professional_name, price_cents, paid_cents, customer_name, customer_email, customer_phone")
    .eq("id", bookingId)
    .eq("store_id", storeId)
    .maybeSingle();
  const b = data as BookingRow | null;
  if (!b) return { ok: false, error: "Agendamento não encontrado." };
  if (b.status !== "confirmed" && b.status !== "completed") return { ok: false, error: "Só dá para receber agendamentos confirmados ou atendidos." };

  const markCompleted = async () => {
    if (b.status !== "confirmed") return false;
    const pct = b.professional_id ? await professionalPercent(db, b.professional_id, b.service_id) : null;
    const { data: upd } = await db
      .from("bookings")
      .update({ status: "completed", ...(pct !== undefined ? { commission_percent: pct } : {}) })
      .eq("id", b.id)
      .eq("status", "confirmed")
      .select("id");
    return !!upd?.length;
  };

  const due = Math.max(0, b.price_cents - b.paid_cents);
  if (due === 0) return { ok: true, id: null, code: null, totalCents: 0, stockIssue: false, completedNow: await markCompleted() }; // tudo pago online
  if (!isCounterPayment(payment)) return { ok: false, error: "Escolha a forma de pagamento." };
  const rawDiscount = Number(discount ?? 0);
  if (!Number.isInteger(rawDiscount) || rawDiscount < 0) return { ok: false, error: "Desconto inválido." };
  const { discountCents, totalCents } = counterTotal(due, rawDiscount);

  const { data: order, error } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      customer_name: b.customer_name,
      customer_email: b.customer_email ?? "",
      customer_cpf: "",
      customer_phone: normalizePhone(b.customer_phone),
      shipping_address: null,
      shipping_method: COUNTER_METHOD,
      subtotal_cents: due,
      shipping_cents: 0,
      discount_cents: discountCents,
      total_cents: totalCents,
      counter_payment: payment,
      booking_id: b.id,
    })
    .select("id, code")
    .single();
  // 23505: o índice único de recebimento por agendamento recusou (já foi recebido).
  if (error?.code === "23505") return { ok: false, error: "Este agendamento já foi recebido." };
  if (error) throw error;

  const { error: itemErr } = await db.from("order_items").insert({
    store_id: storeId,
    order_id: order.id,
    variant_id: null,
    product_name: b.service_name,
    variant_name: "Único",
    unit_price_cents: due,
    quantity: 1,
    service_id: b.service_id,
    professional_id: b.professional_id,
    professional_name: b.professional_name,
    booking_id: b.id,
  });
  if (itemErr) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemErr;
  }
  const result = await confirmAndClose(db, order, totalCents);
  return { ...result, completedNow: await markCompleted() };
}

// Venda lançada por engano: cancela e devolve os itens ao estoque (se a baixa aconteceu inteira).
// O recebimento de um agendamento cancelado libera o agendamento para receber de novo (ele continua atendido).
export async function cancelCounterSale(db: SupabaseClient, storeId: string, orderId: string) {
  const { data: o } = await db.from("orders").select("id, shipping_method, stock_issue, status").eq("id", orderId).eq("store_id", storeId).maybeSingle();
  if (!o || o.shipping_method !== COUNTER_METHOD) return { error: "Venda não encontrada." };
  if (o.status === "canceled") return { error: "Esta venda já foi cancelada." };
  const restock = !o.stock_issue; // com falta de estoque na venda, a baixa foi parcial: o lojista ajusta à mão
  const { data: ok, error } = await db.rpc("refund_order", { p_order_id: orderId, p_restock: restock });
  if (error || !ok) return { error: "Não foi possível cancelar a venda." };
  // Pacotes vendidos nesta venda deixam de valer (sessões já usadas continuam registradas).
  await db.from("customer_packages").update({ status: "canceled" }).eq("store_id", storeId).eq("order_id", orderId).eq("status", "active");
  return { ok: true as const, restocked: restock };
}
