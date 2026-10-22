import { NextResponse, after } from "next/server";
import { notifyPlatformError } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment, verifyWebhookSignature } from "@/lib/payments/mercadopago";
import { BILLING_PROVIDER, platformAccessToken, recordInvoicePayment } from "@/lib/billing-server";

// Webhook do Mercado Pago da PLATAFORMA: pagamentos das faturas dos lojistas (implantação e mensalidade).
//   https://www.pmsapp.dev/api/webhooks/plataforma  (vai em cada link de pagamento como notification_url)
// Como no webhook das lojas: o status vem sempre da consulta ao Mercado Pago, nunca do payload.

export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = await req.text();
  let json: { id?: unknown; type?: unknown; data?: { id?: unknown } } = {};
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const type = json.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const queryDataId = url.searchParams.get("data.id");
  const paymentId = String(json.data?.id ?? queryDataId ?? url.searchParams.get("id") ?? "");
  if (type !== "payment" || !paymentId) return NextResponse.json({ ok: true, ignored: true }); // ex.: merchant_order

  const token = platformAccessToken();
  if (!token) {
    after(() => notifyPlatformError("webhook-plataforma:sem-token", "Webhook da cobrança sem MP_PLATFORM_ACCESS_TOKEN", { pagamento: paymentId }));
    return NextResponse.json({ ok: true, ignored: true });
  }

  const secret = process.env.MP_PLATFORM_WEBHOOK_SECRET;
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (secret && xSignature) {
    const valid = verifyWebhookSignature({ xSignature, xRequestId, dataId: queryDataId ?? paymentId, secret });
    if (!valid) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  // Idempotência: registra o evento; se já foi processado, encerra.
  const db = createAdminClient();
  const eventId = json.id != null ? String(json.id) : `${paymentId}:${xRequestId ?? Date.now()}`;
  await db.from("webhook_events").upsert({ provider: BILLING_PROVIDER, event_id: eventId }, { onConflict: "provider,event_id", ignoreDuplicates: true });
  const { data: ev } = await db.from("webhook_events").select("processed_at").eq("provider", BILLING_PROVIDER).eq("event_id", eventId).single();
  if (ev?.processed_at) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await recordInvoicePayment(db, await getPayment(paymentId, token));
  } catch (err) {
    console.error("Erro no webhook da cobrança", { paymentId, err });
    after(() => notifyPlatformError("webhook-plataforma:erro", "Erro ao processar pagamento de fatura", { pagamento: paymentId, erro: String(err) }));
    throw err; // 500 → o Mercado Pago reenvia
  }

  await db.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", BILLING_PROVIDER).eq("event_id", eventId);
  return NextResponse.json({ ok: true });
}
