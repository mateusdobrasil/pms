import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isUuid } from "@/lib/validation";
import { ORDER_PAYMENT_FIELDS, amountFor, recordPayment } from "@/lib/payments/record";
import { rateLimit } from "@/lib/rate-limit";
import {
  MercadoPagoError,
  PIX_TTL_MINUTES,
  cardStatusMessage,
  createCardPayment,
  createPixPayment,
  toGatewayPayment,
  type CardInput,
} from "@/lib/payments/mercadopago";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

function parseCard(b: Record<string, unknown>): CardInput | null {
  const id = (b.payer as { identification?: { type?: unknown; number?: unknown } } | undefined)?.identification;
  const installments = Number(b.installments);
  if (typeof b.token !== "string" || !b.token) return null;
  if (typeof b.paymentMethodId !== "string" || !b.paymentMethodId) return null;
  if (!Number.isInteger(installments) || installments < 1 || installments > 24) return null;
  if (typeof id?.type !== "string" || typeof id?.number !== "string") return null;
  return {
    token: b.token,
    installments,
    paymentMethodId: b.paymentMethodId,
    issuerId: b.issuerId == null || b.issuerId === "" ? null : String(b.issuerId),
    identification: { type: id.type, number: id.number },
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isUuid(token)) return fail("Pedido não encontrado", 404);

  const store = await getStoreFromRequest(req);
  if (!store) return fail("Loja não encontrada", 404);

  const limited = await rateLimit(req, store.id, "pay");
  if (limited) return limited;

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(`${ORDER_PAYMENT_FIELDS}, code, expires_at, customer_name, customer_email, customer_cpf`)
    .eq("store_id", store.id)
    .eq("public_token", token)
    .maybeSingle();
  if (!order) return fail("Pedido não encontrado", 404);
  if (order.status !== "pending_payment") return fail("Este pedido não está mais aguardando pagamento.", 409);
  if (order.expires_at && new Date(order.expires_at) < new Date()) {
    return fail("Este pedido expirou. Faça um novo pedido.", 409);
  }

  const { data: secret } = await db
    .from("store_secrets")
    .select("gateway_access_token")
    .eq("store_id", store.id)
    .maybeSingle();
  if (!secret?.gateway_access_token) return fail("Pagamento indisponível nesta loja no momento.", 503);

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const common = {
    accessToken: secret.gateway_access_token as string,
    storeId: store.id,
    orderId: order.id,
    description: `Pedido ${order.code} - ${store.name}`,
  };
  const payer = { name: order.customer_name, email: order.customer_email, cpf: order.customer_cpf };

  try {
    if (body.method === "pix") {
      // Reaproveita um Pix pendente que ainda tenha alguns minutos de validade (evita cobrança dupla).
      const { data: existing } = await db
        .from("payments")
        .select("raw")
        .eq("order_id", order.id)
        .eq("method", "pix")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const reused = existing ? toGatewayPayment(existing.raw).pix : null;
      if (reused?.expiresAt && new Date(reused.expiresAt).getTime() > Date.now() + 2 * 60_000) {
        return NextResponse.json({ status: "pending", pix: reused });
      }

      const expiresAt = new Date(Date.now() + PIX_TTL_MINUTES * 60_000);
      const payment = await createPixPayment({ ...common, amountCents: amountFor(order, "pix"), payer, expiresAt });
      if (!payment.pix) throw new Error("Pix sem QR code");
      await recordPayment(db, order, payment);

      // O pedido vale enquanto o Pix valer.
      if (!order.expires_at || new Date(order.expires_at) < expiresAt) {
        await db
          .from("orders")
          .update({ expires_at: expiresAt.toISOString() })
          .eq("id", order.id)
          .eq("status", "pending_payment");
      }
      return NextResponse.json({ status: "pending", pix: payment.pix });
    }

    if (body.method === "card") {
      const card = parseCard(body);
      if (!card) return fail("Dados do cartão incompletos.");

      const payment = await createCardPayment({ ...common, amountCents: amountFor(order, "card"), payer, card });
      if (!(await recordPayment(db, order, payment))) return fail("Não foi possível registrar o pagamento.", 500);
      return NextResponse.json({ status: payment.status, message: cardStatusMessage(payment) });
    }

    return fail("Forma de pagamento inválida.");
  } catch (err) {
    console.error(
      "Erro ao criar pagamento",
      { orderId: order.id, method: body.method },
      err instanceof MercadoPagoError ? JSON.stringify(err.body) : err,
    );
    // Falha do lado do Mercado Pago (5xx): avisa o cliente que é temporário e oferece a outra forma.
    if (err instanceof MercadoPagoError && err.status >= 500) {
      const other = body.method === "pix" ? "pague com cartão" : "pague com Pix";
      return fail(`O Mercado Pago está instável no momento. Tente de novo em alguns minutos ou ${other}.`, 503);
    }
    return fail("Não foi possível processar o pagamento. Tente novamente.", 502);
  }
}
