import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/validation";
import { createReview } from "@/lib/reviews-server";

// Avaliação da compra ou do atendimento, pelo link (o mesmo token da página do pedido ou do agendamento).
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  const limited = await rateLimit(req, store.id, "review");
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  if (!isUuid(token)) return NextResponse.json({ error: "Link inválido" }, { status: 400 });
  const r = await createReview(createAdminClient(), store.id, token, { rating: body?.rating, comment: body?.comment });
  return "error" in r ? NextResponse.json({ error: r.error }, { status: 409 }) : NextResponse.json({ ok: true }, { status: 201 });
}
