import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendExpiredOrderReminders } from "@/lib/order-recovery";
import { notifyPlatformError } from "@/lib/email";

// De hora em hora, das 8h15 às 21h15 de Brasília (vercel.json → crons; nada de e-mail de madrugada):
// e-mail de segunda chance para pedidos expirados sem pagamento.
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
    const result = await sendExpiredOrderReminders(createAdminClient());
    console.log("Pedidos expirados", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Erro nos avisos de pedido expirado", err);
    await notifyPlatformError("cron:pedidos-expirados", "Erro nos avisos de pedido expirado", { erro: String(err) });
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
