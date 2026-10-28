"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyBackInStock, notifyOrderRefunded, notifyOrderShipped, notifyPlatformError } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { MercadoPagoError, getPayment, refundPayment } from "@/lib/payments/mercadopago";
import { requireStore } from "@/lib/panel";
import { isUuid } from "@/lib/validation";
import { isCorreiosCode } from "@/lib/correios";
import { syncOrderTracking } from "@/lib/correios-server";
import { MEMBER_TRANSITIONS, SOLD_STATUSES, staffTransitions, statusLabel, type OrderStatus } from "@/lib/order-status";

export type OrderActionState = { error?: string; ok?: string } | null;

// Atualiza com o cliente da sessão: RLS limita à loja do lojista e o trigger valida a transição.
async function loadOrder(id: string) {
  const { supabase, store, role } = await requireStore("vendas");
  if (!isUuid(id)) return { supabase, role, store, order: null };
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, shipping_method")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  return { supabase, role, store, order: order as { id: string; status: OrderStatus; shipping_method: string } | null };
}

function done(id: string, ok: string): OrderActionState {
  revalidatePath(`/painel/pedidos/${id}`);
  revalidatePath("/painel/pedidos");
  revalidatePath("/painel");
  return { ok };
}

export async function changeStatus(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  const id = String(form.get("orderId") ?? "");
  const next = String(form.get("status") ?? "") as OrderStatus;

  const { supabase, role, order } = await loadOrder(id);
  if (!order) return { error: "Pedido não encontrado." };
  if (!(role === "owner" ? MEMBER_TRANSITIONS[order.status] : staffTransitions(order.status))?.includes(next)) {
    return { error: `Não é possível passar de "${statusLabel(order.status)}" para "${statusLabel(next)}".` };
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: next })
    .eq("id", order.id)
    .eq("status", order.status) // evita sobrescrever uma mudança feita em paralelo
    .select("id");
  if (error || !data?.length) return { error: "Não foi possível atualizar. Recarregue a página e tente de novo." };

  // E-mail ao cliente: enviado / pronto para retirada (uma vez só, trava em notified_shipped_at).
  if (next === "shipped") after(() => notifyOrderShipped(order.id));
  return done(order.id, `Pedido marcado como "${statusLabel(next, order.shipping_method)}".`);
}

export async function saveTracking(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  const id = String(form.get("orderId") ?? "");
  const code = String(form.get("trackingCode") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) return { error: "Código de rastreio inválido." };

  const { supabase, store, order } = await loadOrder(id);
  if (!order) return { error: "Pedido não encontrado." };

  // Informar o rastreio de um pedido pago/em preparação já o marca como enviado.
  const markShipped = order.status === "paid" || order.status === "preparing";
  if (!markShipped && order.status !== "shipped" && order.status !== "delivered") {
    return { error: "Só é possível informar rastreio de pedidos pagos." };
  }

  const { data, error } = await supabase
    .from("orders")
    .update(markShipped ? { tracking_code: code, status: "shipped" } : { tracking_code: code })
    .eq("id", order.id)
    .eq("status", order.status)
    .select("id");
  if (error || !data?.length) return { error: "Não foi possível salvar. Recarregue a página e tente de novo." };

  // Código novo: o histórico do anterior sai (SQL 20261126000000; sem ele, nada a limpar). Dos Correios, já consulta.
  const admin = createAdminClient();
  await admin.from("orders").update({ tracking_events: null, tracking_checked_at: null }).eq("id", order.id).eq("store_id", store.id);
  if (isCorreiosCode(code)) after(() => syncOrderTracking(admin, store.id, order.id));

  if (markShipped) after(() => notifyOrderShipped(order.id));
  return done(order.id, markShipped ? "Rastreio salvo e pedido marcado como enviado." : "Rastreio atualizado.");
}

// "Atualizar rastreio": consulta os Correios agora (contrato da loja).
export async function refreshTracking(orderId: string): Promise<OrderActionState> {
  const { store } = await requireStore("vendas");
  if (!isUuid(orderId)) return { error: "Pedido não encontrado." };
  const r = await syncOrderTracking(createAdminClient(), store.id, orderId);
  if (!r.ok) return { error: r.error };
  return done(orderId, r.delivered ? "Entregue! O pedido foi marcado como entregue." : "Rastreio atualizado.");
}

// Cancelar e estornar: devolve o pagamento no Mercado Pago (conta do lojista), cancela o pedido e,
// se marcado, devolve os itens ao estoque. Seguro para repetir: consulta o pagamento antes de estornar.
export async function refundOrder(_prev: OrderActionState, form: FormData): Promise<OrderActionState> {
  const id = String(form.get("orderId") ?? "");
  const restock = form.get("restock") === "on";
  const { supabase, store } = await requireStore();
  if (!isUuid(id)) return { error: "Pedido não encontrado." };

  // RLS: o lojista só enxerga os pedidos e pagamentos da própria loja.
  const { data } = await supabase
    .from("orders")
    .select("id, status, payments(provider_payment_id, method, status)")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  const order = data as { id: string; status: OrderStatus; payments: { provider_payment_id: string; method: "pix" | "card"; status: string }[] } | null;
  if (!order) return { error: "Pedido não encontrado." };
  if (!SOLD_STATUSES.includes(order.status)) return { error: "Só é possível estornar pedidos pagos." };
  const payment = order.payments.find((p) => p.status === "approved" || p.status === "refunded");
  if (!payment) return { error: "Este pedido não tem pagamento aprovado para estornar." };

  const db = createAdminClient();
  const { data: secret } = await db.from("store_secrets").select("gateway_access_token").eq("store_id", store.id).maybeSingle();
  if (!secret?.gateway_access_token) return { error: "Mercado Pago não configurado. Fale com o suporte." };

  try {
    const current = await getPayment(payment.provider_payment_id, secret.gateway_access_token);
    if (current.status !== "refunded") await refundPayment(payment.provider_payment_id, secret.gateway_access_token);
  } catch (err) {
    console.error("Estorno recusado pelo Mercado Pago", { orderId: id, err });
    const detail = err instanceof MercadoPagoError ? (err.body as { message?: string } | null)?.message : null;
    return {
      error: `O Mercado Pago não fez o estorno${detail ? ` (${detail})` : ""}. Confira se há saldo na sua conta do Mercado Pago ou faça o estorno pelo app dele.`,
    };
  }

  // Dinheiro já devolvido: daqui em diante só atualizamos o pedido (service role: transição feita pelo servidor).
  await db.from("payments").update({ status: "refunded" }).eq("store_id", store.id).eq("provider_payment_id", payment.provider_payment_id);
  const { data: refunded, error } = await db.rpc("refund_order", { p_order_id: id, p_restock: restock });
  if (error || !refunded) {
    console.error("Estorno feito, mas o pedido não foi atualizado", { orderId: id, error });
    after(() => notifyPlatformError(`estorno:${id}`, "Estorno feito no Mercado Pago, mas o pedido não foi atualizado", { pedido: id, erro: error?.message ?? "refund_order devolveu false" }));
    return { error: "O dinheiro foi devolvido, mas não foi possível atualizar o pedido. Recarregue a página; se continuar, fale com o suporte." };
  }

  console.log("[estorno] pedido cancelado; e-mail agendado para depois da resposta", { orderId: id });
  after(() => notifyOrderRefunded(id, payment.method));
  if (restock) after(() => notifyBackInStock(store.id));
  return done(id, restock ? "Pedido cancelado, valor estornado e itens devolvidos ao estoque." : "Pedido cancelado e valor estornado.");
}
