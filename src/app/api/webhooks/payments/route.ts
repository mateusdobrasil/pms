import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { recordPayment } from "@/lib/payments/record";
import { PROVIDER, getPayment, verifyWebhookSignature } from "@/lib/payments/mercadopago";

// URL de notificação enviada em cada pagamento (notification_url):
//   https://pmsapp.dev/api/webhooks/payments?store=<store_id>
// Assim sabemos qual credencial usar para consultar o pagamento.
//
// Segurança: o status nunca vem do payload — sempre consultamos o pagamento com o token da loja,
// então um aviso forjado não confirma nada. A assinatura (x-signature) é uma camada extra:
// se a loja tem o segredo cadastrado e o header vier, ele precisa bater.

export async function POST(req: Request) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get("store");
  if (!storeId || !isUuid(storeId)) return NextResponse.json({ error: "store ausente" }, { status: 400 });

  const body = await req.text();
  let json: { id?: unknown; type?: unknown; data?: { id?: unknown } } = {};
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  // Formato atual (webhook) ou legado (IPN: ?topic=payment&id=...).
  const type = json.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const queryDataId = url.searchParams.get("data.id");
  const paymentId = String(json.data?.id ?? queryDataId ?? url.searchParams.get("id") ?? "");
  if (type !== "payment" || !paymentId) return NextResponse.json({ ok: true, ignored: true });

  const db = createAdminClient();
  const { data: secret } = await db
    .from("store_secrets")
    .select("gateway_access_token, gateway_webhook_secret")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!secret?.gateway_access_token) {
    console.error("Webhook para loja sem credencial", { storeId });
    return NextResponse.json({ ok: true, ignored: true }); // 200 para o gateway não reenviar para sempre
  }

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (secret.gateway_webhook_secret && xSignature) {
    const valid = verifyWebhookSignature({
      xSignature,
      xRequestId,
      dataId: queryDataId ?? paymentId,
      secret: secret.gateway_webhook_secret,
    });
    if (!valid) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  // Idempotência: registra o evento; se já foi processado, encerra.
  const eventId = json.id != null ? String(json.id) : `${paymentId}:${xRequestId ?? Date.now()}`;
  await db
    .from("webhook_events")
    .upsert({ provider: PROVIDER, event_id: eventId }, { onConflict: "provider,event_id", ignoreDuplicates: true });

  const { data: ev } = await db
    .from("webhook_events")
    .select("processed_at")
    .eq("provider", PROVIDER)
    .eq("event_id", eventId)
    .single();
  if (ev?.processed_at) return NextResponse.json({ ok: true, duplicate: true });

  // Nunca confie no payload: o status vem da consulta direta ao gateway.
  // Erro aqui → 500 → o gateway reenvia.
  const payment = await getPayment(paymentId, secret.gateway_access_token);

  if (payment.orderId && isUuid(payment.orderId)) {
    const { data: order } = await db
      .from("orders")
      .select("id, store_id, total_cents")
      .eq("id", payment.orderId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (order) await recordPayment(db, order, payment);
  }

  await db
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", PROVIDER)
    .eq("event_id", eventId);

  return NextResponse.json({ ok: true });
}
