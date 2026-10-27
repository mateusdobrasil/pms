import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeBaseUrl } from "@/lib/urls";
import { pushToStore } from "@/lib/push";
import { notifyReviewRequest } from "@/lib/email";
import { sendWhatsappEvent } from "@/lib/whatsapp-send";
import { COUNTER_METHOD } from "@/lib/counter";
import { PAYMENT_LINK_METHOD } from "@/lib/payment-links";
import { PACKAGE_METHOD } from "@/lib/packages";
import { REVIEW_LOOKBACK_DAYS, authorName, bookingReviewDue, bookingReviewable, orderReviewDue, orderReviewable, parseReview, ratingSummary, starsText } from "@/lib/reviews";

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  author_name: string;
  service_name: string | null;
  reply: string | null;
  created_at: string;
};
export const PUBLIC_REVIEW_FIELDS = "id, rating, comment, author_name, service_name, reply, created_at";

// Compra ou atendimento do link de avaliação (o token é o mesmo da página do pedido ou do agendamento).
export async function reviewTarget(db: SupabaseClient, storeId: string, token: string) {
  const { data: o } = await db.from("orders").select("id, status, customer_name, shipping_method").eq("store_id", storeId).eq("public_token", token).maybeSingle();
  if (o) {
    const { data: r } = await db.from("reviews").select(PUBLIC_REVIEW_FIELDS).eq("order_id", o.id).maybeSingle();
    const kind = o.shipping_method === COUNTER_METHOD || o.shipping_method === PAYMENT_LINK_METHOD || o.shipping_method === PACKAGE_METHOD ? null : ("order" as const);
    return { kind, id: o.id, customerName: o.customer_name as string, serviceId: null, serviceName: null, professionalName: null, reviewable: !!kind && orderReviewable(o.status), review: r as PublicReview | null };
  }
  const { data: b } = await db.from("bookings").select("id, status, customer_name, service_id, service_name, professional_name").eq("store_id", storeId).eq("public_token", token).maybeSingle();
  if (!b) return null;
  const { data: r } = await db.from("reviews").select(PUBLIC_REVIEW_FIELDS).eq("booking_id", b.id).maybeSingle();
  return { kind: "booking" as const, id: b.id, customerName: b.customer_name as string, serviceId: b.service_id as string | null, serviceName: b.service_name as string, professionalName: b.professional_name as string, reviewable: bookingReviewable(b.status), review: r as PublicReview | null };
}

export async function createReview(db: SupabaseClient, storeId: string, token: string, input: { rating: unknown; comment: unknown }): Promise<{ ok: true } | { error: string }> {
  const t = await reviewTarget(db, storeId, token);
  if (!t?.kind) return { error: "Avaliação não encontrada." };
  if (t.review) return { error: "Você já avaliou. Obrigado!" };
  if (!t.reviewable) return { error: t.kind === "order" ? "Você poderá avaliar depois de receber a compra." : "Você poderá avaliar depois do atendimento." };
  const parsed = parseReview(input);
  if ("error" in parsed) return parsed;
  const { error } = await db.from("reviews").insert({
    store_id: storeId,
    ...(t.kind === "order" ? { order_id: t.id } : { booking_id: t.id, service_id: t.serviceId, service_name: t.serviceName, professional_name: t.professionalName }),
    rating: parsed.rating,
    comment: parsed.comment,
    author_name: authorName(t.customerName),
  });
  if (error) return { error: error.code === "23505" ? "Você já avaliou. Obrigado!" : "Não foi possível enviar agora. Tente de novo." };
  await pushToStore(storeId, {
    title: `Nova avaliação ${starsText(parsed.rating)}`,
    body: `${authorName(t.customerName)}${t.serviceName ? ` · ${t.serviceName}` : ""}${parsed.comment ? `: ${parsed.comment.slice(0, 80)}` : ""}`,
    url: "/painel/avaliacoes",
    tag: `review-${t.id}`,
  }).catch(() => {});
  return { ok: true };
}

// Avaliações visíveis da loja: a média geral e as mais recentes (sem a tabela, nada).
export async function storeReviews(db: SupabaseClient, storeId: string, limit = 50) {
  const [{ data: ratings, error }, { data: latest }] = await Promise.all([
    db.from("reviews").select("rating").eq("store_id", storeId).eq("hidden", false).limit(10000),
    db.from("reviews").select(PUBLIC_REVIEW_FIELDS).eq("store_id", storeId).eq("hidden", false).order("created_at", { ascending: false }).limit(limit),
  ]);
  if (error) return { summary: ratingSummary([]), reviews: [] as PublicReview[] };
  return { summary: ratingSummary((ratings ?? []).map((r) => r.rating as number)), reviews: (latest ?? []) as PublicReview[] };
}

// Média por serviço (agenda), só das visíveis.
export async function serviceRatings(db: SupabaseClient, storeId: string) {
  const { data } = await db.from("reviews").select("service_id, rating").eq("store_id", storeId).eq("hidden", false).not("service_id", "is", null).limit(10000);
  const by = new Map<string, number[]>();
  for (const r of (data ?? []) as { service_id: string; rating: number }[]) by.set(r.service_id, [...(by.get(r.service_id) ?? []), r.rating]);
  return new Map([...by].map(([id, list]) => [id, ratingSummary(list)]));
}

type StoreRef = { name: string; email: string | null; primary_color: string; status: string; store_domains: { domain: string; is_primary: boolean }[] };
const baseOf = (s: StoreRef) => {
  const d = (s.store_domains.find((x) => x.is_primary) ?? s.store_domains[0])?.domain;
  return d ? storeBaseUrl(d) : null;
};

// Rotina de hora em hora (9h às 21h): pede avaliação das compras entregues e dos atendimentos feitos, uma vez cada
// (trava review_requested_at), por e-mail e pelo WhatsApp (evento review_request, se houver modelo). Nunca lança erro.
// storeId: só uma loja (rodar à mão).
export async function sendReviewRequests(db: SupabaseClient, now = new Date(), storeId?: string) {
  const result = { orders: 0, bookings: 0 };
  try {
    const since = new Date(now.getTime() - REVIEW_LOOKBACK_DAYS * 86_400_000).toISOString();
    let ordersQuery = db
      .from("orders")
      .select("id, store_id, public_token, status, paid_at, notified_shipped_at, shipping_method, customer_name, customer_email, customer_phone, stores!inner(name, email, primary_color, status, store_domains(domain, is_primary))")
      .in("status", ["shipped", "delivered"])
      .is("review_requested_at", null)
      .gte("paid_at", since)
      .not("shipping_method", "in", `("${COUNTER_METHOD}","${PAYMENT_LINK_METHOD}","${PACKAGE_METHOD}")`)
      .limit(300);
    if (storeId) ordersQuery = ordersQuery.eq("store_id", storeId);
    const { data: orders, error } = await ordersQuery;
    if (error) return result; // sem o SQL das avaliações
    for (const o of (orders ?? []) as unknown as (Parameters<typeof orderReviewDue>[0] & { id: string; store_id: string; public_token: string; customer_name: string; customer_email: string; customer_phone: string | null; stores: StoreRef })[]) {
      if (o.stores.status !== "active" || !orderReviewDue(o, now)) continue;
      const base = baseOf(o.stores);
      if (!base) continue;
      const { data: claimed } = await db.from("orders").update({ review_requested_at: now.toISOString() }).eq("id", o.id).is("review_requested_at", null).select("id");
      if (!claimed?.length) continue;
      const { count: done } = await db.from("reviews").select("id", { count: "exact", head: true }).eq("order_id", o.id);
      if (done) continue; // já avaliou pela página do pedido
      const link = `${base}/avaliar/${o.public_token}`;
      await notifyReviewRequest({ ...o.stores, id: o.store_id }, { name: o.customer_name, email: o.customer_email }, { kind: "order", link });
      await sendWhatsappEvent({ storeId: o.store_id, event: "review_request", phone: o.customer_phone, data: { first_name: o.customer_name.split(" ")[0], customer_name: o.customer_name, store_name: o.stores.name, link }, orderId: o.id }, db);
      result.orders++;
    }
    let bookingsQuery = db
      .from("bookings")
      .select("id, store_id, public_token, status, ends_at, service_name, customer_name, customer_email, customer_phone, stores!inner(name, email, primary_color, status, store_domains(domain, is_primary))")
      .eq("status", "completed")
      .is("review_requested_at", null)
      .gte("ends_at", since)
      .limit(300);
    if (storeId) bookingsQuery = bookingsQuery.eq("store_id", storeId);
    const { data: bookings } = await bookingsQuery;
    for (const b of (bookings ?? []) as unknown as { id: string; store_id: string; public_token: string; status: string; ends_at: string; service_name: string; customer_name: string; customer_email: string | null; customer_phone: string | null; stores: StoreRef }[]) {
      if (b.stores.status !== "active" || !bookingReviewDue(b, now)) continue;
      const base = baseOf(b.stores);
      if (!base) continue;
      const { data: claimed } = await db.from("bookings").update({ review_requested_at: now.toISOString() }).eq("id", b.id).is("review_requested_at", null).select("id");
      if (!claimed?.length) continue;
      const { count: done } = await db.from("reviews").select("id", { count: "exact", head: true }).eq("booking_id", b.id);
      if (done) continue;
      const link = `${base}/avaliar/${b.public_token}`;
      if (b.customer_email) await notifyReviewRequest({ ...b.stores, id: b.store_id }, { name: b.customer_name, email: b.customer_email }, { kind: "booking", link, serviceName: b.service_name });
      await sendWhatsappEvent({ storeId: b.store_id, event: "review_request", phone: b.customer_phone, data: { first_name: b.customer_name.split(" ")[0], customer_name: b.customer_name, store_name: b.stores.name, service: b.service_name, link }, bookingId: b.id }, db);
      result.bookings++;
    }
  } catch (err) {
    console.error("Falha nos pedidos de avaliação", err);
  }
  return result;
}
