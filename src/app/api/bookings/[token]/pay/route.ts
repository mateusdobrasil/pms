import { NextResponse, after } from "next/server";
import { notifyPlatformError } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isUuid } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { BOOKING_PAYMENT_FIELDS, recordBookingPayment } from "@/lib/booking-server";
import { MercadoPagoError, PIX_TTL_MINUTES, cardStatusMessage, createCardPayment, createPixPayment, toGatewayPayment } from "@/lib/payments/mercadopago";
import { parseCard } from "@/lib/payments/card-input";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Pagamento online do agendamento (valor inteiro ou sinal), no Mercado Pago do lojista. Mesmo fluxo dos pedidos.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isUuid(token)) return fail("Agendamento não encontrado", 404);
  const store = await getStoreFromRequest(req);
  if (!store) return fail("Loja não encontrada", 404);
  const limited = await rateLimit(req, store.id, "pay");
  if (limited) return limited;

  const db = createAdminClient();
  const { data: booking } = await db.from("bookings").select(BOOKING_PAYMENT_FIELDS).eq("store_id", store.id).eq("public_token", token).maybeSingle();
  if (!booking) return fail("Agendamento não encontrado", 404);
  if (booking.status !== "pending_payment") return fail("Este agendamento não está mais aguardando pagamento.", 409);
  if (booking.expires_at && new Date(booking.expires_at) < new Date()) return fail("O prazo para pagar acabou e o horário foi liberado. Agende de novo.", 409);
  if (!booking.customer_cpf) return fail("CPF não informado. Agende de novo.", 409);

  const { data: secret } = await db.from("store_secrets").select("gateway_access_token").eq("store_id", store.id).maybeSingle();
  if (!secret?.gateway_access_token) return fail("Pagamento indisponível nesta loja no momento.", 503);

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const common = {
    accessToken: secret.gateway_access_token as string,
    storeId: store.id,
    orderId: `booking:${booking.id}`, // external_reference: o webhook sabe que é agendamento
    description: `Agendamento ${booking.code} - ${booking.service_name} - ${store.name}`,
    amountCents: booking.online_cents,
  };
  const payer = { name: booking.customer_name, email: booking.customer_email, cpf: booking.customer_cpf };

  try {
    if (body.method === "pix") {
      // Reaproveita um Pix pendente que ainda tenha alguns minutos de validade (evita cobrança dupla).
      const { data: existing } = await db
        .from("booking_payments")
        .select("raw")
        .eq("booking_id", booking.id)
        .eq("method", "pix")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const reused = existing ? toGatewayPayment(existing.raw).pix : null;
      if (reused?.expiresAt && new Date(reused.expiresAt).getTime() > Date.now() + 2 * 60_000) return NextResponse.json({ status: "pending", pix: reused });

      const expiresAt = new Date(Date.now() + PIX_TTL_MINUTES * 60_000);
      const payment = await createPixPayment({ ...common, payer, expiresAt });
      if (!payment.pix) throw new Error("Pix sem QR code");
      await recordBookingPayment(db, booking, payment);
      // O horário fica segurado enquanto o Pix valer.
      await db.from("bookings").update({ expires_at: expiresAt.toISOString() }).eq("id", booking.id).eq("status", "pending_payment");
      return NextResponse.json({ status: "pending", pix: payment.pix });
    }
    if (body.method === "card") {
      const card = parseCard(body);
      if (!card) return fail("Dados do cartão incompletos.");
      const payment = await createCardPayment({ ...common, payer, card });
      if (!(await recordBookingPayment(db, booking, payment))) return fail("Não foi possível registrar o pagamento.", 500);
      return NextResponse.json({ status: payment.status, message: cardStatusMessage(payment) });
    }
    return fail("Forma de pagamento inválida.");
  } catch (err) {
    console.error("Erro ao criar pagamento de agendamento", { bookingId: booking.id, method: body.method }, err instanceof MercadoPagoError ? JSON.stringify(err.body) : err);
    after(() =>
      notifyPlatformError(`pagamento-agendamento:${String(body.method)}:${store.id}`, `Falha ao criar pagamento de agendamento (${store.name})`, {
        loja: store.name,
        agendamento: booking.code,
        forma: body.method,
        erro: err instanceof MercadoPagoError ? err.body : String(err),
      }),
    );
    if (err instanceof MercadoPagoError && err.status >= 500) {
      return fail(`O Mercado Pago está instável no momento. Tente de novo em alguns minutos ou ${body.method === "pix" ? "pague com cartão" : "pague com Pix"}.`, 503);
    }
    return fail("Não foi possível processar o pagamento. Tente novamente.", 502);
  }
}
