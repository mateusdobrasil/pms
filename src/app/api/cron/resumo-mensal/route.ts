import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMonthlyReports } from "@/lib/monthly-report-server";
import { notifyPlatformError } from "@/lib/email";

// Dias 1, 2 e 3 às 8h de Brasília (vercel.json → crons): resumo do mês anterior para cada lojista.
// Cada loja recebe uma vez por mês (store_monthly_reports); os dias 2 e 3 só repetem quem falhou.
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, 401.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
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
