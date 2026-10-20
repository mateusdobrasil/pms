"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyOrderShipped } from "@/lib/email";
import { requireStore } from "@/lib/panel";
import { isUuid } from "@/lib/validation";
import { MEMBER_TRANSITIONS, statusLabel, type OrderStatus } from "@/lib/order-status";

export type OrderActionState = { error?: string; ok?: string } | null;

// Atualiza com o cliente da sessão: RLS limita à loja do lojista e o trigger valida a transição.
async function loadOrder(id: string) {
  const { supabase, store } = await requireStore();
  if (!isUuid(id)) return { supabase, order: null };
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, shipping_method")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  return { supabase, order: order as { id: string; status: OrderStatus; shipping_method: string } | null };
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

  const { supabase, order } = await loadOrder(id);
  if (!order) return { error: "Pedido não encontrado." };
  if (!MEMBER_TRANSITIONS[order.status]?.includes(next)) {
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

  const { supabase, order } = await loadOrder(id);
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

  if (markShipped) after(() => notifyOrderShipped(order.id));
  return done(order.id, markShipped ? "Rastreio salvo e pedido marcado como enviado." : "Rastreio atualizado.");
}
