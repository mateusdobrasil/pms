import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrderPaid } from "@/lib/email";
import { PROVIDER, type GatewayPayment } from "@/lib/payments/mercadopago";

type OrderRef = { id: string; store_id: string; total_cents: number };

// Grava o pagamento consultado no gateway e, se aprovado, confirma o pedido (baixa estoque).
// Idempotente: pode ser chamado pelo checkout, pelo polling de status e pelo webhook.
export async function recordPayment(db: SupabaseClient, order: OrderRef, payment: GatewayPayment) {
  if (payment.orderId !== order.id) {
    console.error("Pagamento de outro pedido", { orderId: order.id, paymentId: payment.id });
    return false;
  }
  if (payment.amountCents !== order.total_cents) {
    console.error("Valor divergente", { orderId: order.id, pago: payment.amountCents, esperado: order.total_cents });
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
    // E-mails depois da resposta (não atrasam o webhook). A trava em notified_paid_at evita duplicados.
    after(() => notifyOrderPaid(order.id));
  }
  return true;
}
