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
  // WhatsApp com falha nas últimas 24 h, em qualquer evento (template não aprovado, token vencido, variáveis
  // erradas, número inválido): avisa o admin uma vez por dia, com o erro mais recente.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: waFailed, count: waFailedCount } = await db
    .from("whatsapp_messages")
    .select("template, error", { count: "exact" })
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (waFailedCount) {
    await notifyPlatformError("cron:whatsapp", "Mensagens de WhatsApp com falha", {
      falharam_24h: waFailedCount,
      ultimo_template: waFailed?.[0]?.template,
      ultimo_erro: waFailed?.[0]?.error,
      detalhe: "Veja /admin → WhatsApp → Últimas mensagens.",
    });
  }
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
