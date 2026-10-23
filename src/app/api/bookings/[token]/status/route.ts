import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isUuid } from "@/lib/validation";
import { BOOKING_PAYMENT_FIELDS, recordBookingPayment } from "@/lib/booking-server";
import { getPayment } from "@/lib/payments/mercadopago";

// Polling da página do agendamento: se ainda aguarda pagamento, consulta o Mercado Pago direto
// (confirma mesmo sem webhook ou com webhook atrasado).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isUuid(token)) return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const db = createAdminClient();
  const { data: booking } = await db.from("bookings").select(BOOKING_PAYMENT_FIELDS).eq("store_id", store.id).eq("public_token", token).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });

  if (booking.status === "pending_payment") {
    try {
      const [{ data: pending }, { data: secret }] = await Promise.all([
        db.from("booking_payments").select("provider_payment_id").eq("booking_id", booking.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("store_secrets").select("gateway_access_token").eq("store_id", store.id).maybeSingle(),
      ]);
      if (pending && secret?.gateway_access_token) {
        const payment = await getPayment(pending.provider_payment_id, secret.gateway_access_token);
        await recordBookingPayment(db, booking, payment);
        const { data: fresh } = await db.from("bookings").select("status").eq("id", booking.id).single();
        return NextResponse.json({ status: fresh?.status ?? booking.status });
      }
    } catch (err) {
      console.error("Erro ao consultar pagamento de agendamento", { bookingId: booking.id, err });
    }
  }
  return NextResponse.json({ status: booking.status });
}
