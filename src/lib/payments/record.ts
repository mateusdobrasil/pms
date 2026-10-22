import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrderPaid, notifyPlatformError } from "@/lib/email";
import { PROVIDER, type GatewayPayment } from "@/lib/payments/mercadopago";

// Campos do pedido que toda chamada precisa selecionar.
export const ORDER_PAYMENT_FIELDS = "id, store_id, status, subtotal_cents, shipping_cents, pix_discount_cents";

type OrderRef = {
  id: string;
  store_id: string;
  status: string;
  subtotal_cents: number;
  shipping_cents: number;
  pix_discount_cents: number;
};

// Valor que cada forma de pagamento cobra. Calculado de campos que não mudam depois da criação
// (total_cents muda quando um Pix com desconto é aprovado), para continuar idempotente.
export function amountFor(order: OrderRef, method: "pix" | "card") {
  const full = order.subtotal_cents + order.shipping_cents;
  return method === "pix" ? full - order.pix_discount_cents : full;
}

// Grava o pagamento consultado no gateway e, se aprovado, confirma o pedido (baixa estoque).
// Idempotente: pode ser chamado pelo checkout, pelo polling de status e pelo webhook.
export async function recordPayment(db: SupabaseClient, order: OrderRef, payment: GatewayPayment) {
  if (payment.orderId !== order.id) {
    console.error("Pagamento de outro pedido", { orderId: order.id, paymentId: payment.id });
    after(() => notifyPlatformError("pagamento:pedido-trocado", "Pagamento apontando para outro pedido", { pedido: order.id, pagamento: payment.id, pedido_no_pagamento: payment.orderId }));
    return false;
  }
  const expected = amountFor(order, payment.method);
  if (payment.amountCents !== expected) {
    console.error("Valor divergente", { orderId: order.id, metodo: payment.method, pago: payment.amountCents, esperado: expected });
    after(() =>
      notifyPlatformError("pagamento:valor-divergente", "Pagamento com valor diferente do pedido", {
        pedido: order.id,
        pagamento: payment.id,
        forma: payment.method,
        status: payment.status,
        pago_centavos: payment.amountCents,
        esperado_centavos: expected,
      }),
    );
    return false;
  }

  const { error: payErr } = await db.from("payments").upsert(
    {
      store_id: order.store_id,
      order_id: order.id,
      provider: PROVIDER,
      provider_payment_id: payment.id,
      method: payment.method,
      status: payment.status,
      amount_cents: payment.amountCents,
      raw: payment.raw,
    },
    { onConflict: "provider,provider_payment_id" },
  );
  if (payErr) throw payErr;

  if (payment.status === "approved") {
    const { error } = await db.rpc("confirm_order_payment", { p_order_id: order.id });
    if (error) throw error;
    // Pix com desconto: o pedido passa a valer o que foi pago. Só quando este pagamento é o que
    // confirmou o pedido (num pagamento em dobro, o pedido já estava pago e fica como está).
    const confirmedNow = order.status === "pending_payment" || order.status === "expired";
    if (payment.method === "pix" && order.pix_discount_cents > 0 && confirmedNow) {
      const { error: discErr } = await db
        .from("orders")
        .update({ total_cents: expected, discount_cents: order.pix_discount_cents })
        .eq("id", order.id)
        .eq("discount_cents", 0);
      if (discErr) throw discErr;
    }
    // E-mails depois da resposta (não atrasam o webhook). A trava em notified_paid_at evita duplicados.
    after(() => notifyOrderPaid(order.id));
  }
  return true;
}
