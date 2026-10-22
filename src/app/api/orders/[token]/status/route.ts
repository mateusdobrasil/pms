import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isUuid } from "@/lib/validation";
import { ORDER_PAYMENT_FIELDS, recordPayment } from "@/lib/payments/record";
import { getPayment } from "@/lib/payments/mercadopago";

// Polling da página do pedido. Se ainda está aguardando, consulta o gateway direto:
// funciona mesmo sem webhook (dev local) ou com webhook atrasado.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isUuid(token)) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(ORDER_PAYMENT_FIELDS)
    .eq("store_id", store.id)
    .eq("public_token", token)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  if (order.status === "pending_payment") {
    try {
      const [{ data: pending }, { data: secret }] = await Promise.all([
        db
          .from("payments")
          .select("provider_payment_id")
          .eq("order_id", order.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db.from("store_secrets").select("gateway_access_token").eq("store_id", store.id).maybeSingle(),
      ]);

      if (pending && secret?.gateway_access_token) {
        const payment = await getPayment(pending.provider_payment_id, secret.gateway_access_token);
        await recordPayment(db, order, payment);
        if (payment.status === "approved") {
          const { data: fresh } = await db.from("orders").select("status").eq("id", order.id).single();
          return NextResponse.json({ status: fresh?.status ?? order.status });
        }
      }
    } catch (err) {
      console.error("Erro ao consultar pagamento", { orderId: order.id, err });
    }
  }

  return NextResponse.json({ status: order.status });
}
