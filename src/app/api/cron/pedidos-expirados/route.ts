import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendExpiredOrderReminders } from "@/lib/order-recovery";
import { notifyWaitlistForExpiredHolds } from "@/lib/booking-server";
import { notifyPlatformError } from "@/lib/email";

// De hora em hora, das 8h15 às 21h15 de Brasília (vercel.json → crons; nada de e-mail de madrugada):
// e-mail de segunda chance para pedidos expirados sem pagamento, e aviso da lista de espera quando uma reserva
// não paga da agenda expira e libera o horário.
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, 401.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  try {
    const db = createAdminClient();
    const result = await sendExpiredOrderReminders(db);
    const waitlist = await notifyWaitlistForExpiredHolds(db);
    console.log("Pedidos expirados", result, "| lista de espera", waitlist);
    return NextResponse.json({ ...result, waitlist });
  } catch (err) {
    console.error("Erro nos avisos de pedido expirado", err);
    await notifyPlatformError("cron:pedidos-expirados", "Erro nos avisos de pedido expirado", { erro: String(err) });
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
