import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBilling } from "@/lib/billing-server";
import { sendBookingReminders } from "@/lib/booking-server";
import { notifyPlatformError } from "@/lib/email";

// Rotina diária das 8h de Brasília (vercel.json → crons): cobrança dos lojistas e lembretes de agendamento.
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, 401.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  // Lembretes da véspera dos agendamentos: mesma rotina das 8h, independente da cobrança.
  const db = createAdminClient();
  const bookings = await sendBookingReminders(db).catch(async (err) => {
    console.error("Erro nos lembretes de agendamento", err);
    await notifyPlatformError("cron:lembretes", "Erro nos lembretes de agendamento", { erro: String(err) });
    return { reminders: 0, error: String(err) };
  });
  // Lembrete por WhatsApp com falha (template não aprovado, token vencido, número inválido): avisa o admin.
  const wa = "whatsapp" in bookings ? (bookings.whatsapp as { sent: number; failed: number; skipped?: string }) : null;
  if (wa?.failed) await notifyPlatformError("cron:whatsapp", "Lembretes por WhatsApp com falha", { enviados: wa.sent, falharam: wa.failed, detalhe: "Veja a tabela whatsapp_messages (coluna error)." });
  try {
    const result = await runBilling(db);
    console.log("Cobrança diária", result, "| lembretes", bookings);
    return NextResponse.json({ ...result, bookings });
  } catch (err) {
    console.error("Erro na cobrança diária", err);
    await notifyPlatformError("cron:cobranca", "Erro na rotina diária de cobrança", { erro: String(err) });
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
