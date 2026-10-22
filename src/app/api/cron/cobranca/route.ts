import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBilling } from "@/lib/billing-server";
import { notifyPlatformError } from "@/lib/email";

// Rotina diária da cobrança (vercel.json → crons, 8h de Brasília).
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
  try {
    const result = await runBilling(createAdminClient());
    console.log("Cobrança diária", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Erro na cobrança diária", err);
    await notifyPlatformError("cron:cobranca", "Erro na rotina diária de cobrança", { erro: String(err) });
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
