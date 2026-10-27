import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCampaignQueue } from "@/lib/whatsapp-campaigns-server";

// A cada 5 minutos, das 9h às 20h55 de Brasília (vercel.json → crons): envia a fila das campanhas no WhatsApp.
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, 401.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const result = await processCampaignQueue(createAdminClient());
  if (result.sent || result.failed) console.log("Campanhas no WhatsApp", result);
  return NextResponse.json(result);
}
