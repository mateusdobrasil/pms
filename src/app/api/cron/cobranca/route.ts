import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBilling } from "@/lib/billing-server";
import { sendBookingReminders } from "@/lib/booking-server";
import { notifyPlatformError } from "@/lib/email";

// Rotina diária das 8h de Brasília (vercel.json → crons): cobrança dos lojistas e lembretes de agendamento.
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, 401.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  // Lembretes da véspera dos agendamentos: mesma rotina das 8h, independente da cobrança.
  const db = createAdminClient();
  const bookings = await sendBookingReminders(db).catch(async (err) => {
    console.error("Erro nos lembretes de agendamento", err);
    await notifyPlatformError("cron:lembretes", "Erro nos lembretes de agendamento", { erro: String(err) });
    return { reminders: 0, error: String(err) };
  });
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
