import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMonthlyReports } from "@/lib/monthly-report-server";
import { notifyPlatformError } from "@/lib/email";

// Dias 1, 2 e 3 às 8h de Brasília (vercel.json → crons): resumo do mês anterior para cada lojista.
// Cada loja recebe uma vez por mês (store_monthly_reports); os dias 2 e 3 só repetem quem falhou.
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, 401.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  try {
    const result = await runMonthlyReports(createAdminClient());
    console.log("Resumo do mês", result);
    if (result.failed) await notifyPlatformError("cron:resumo-mensal:falhas", "Resumos do mês não enviados", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Erro no resumo do mês", err);
    await notifyPlatformError("cron:resumo-mensal", "Erro na rotina do resumo do mês", { erro: String(err) });
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
