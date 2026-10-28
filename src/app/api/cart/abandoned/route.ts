import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { rateLimit } from "@/lib/rate-limit";
import { parseCapture } from "@/lib/abandoned-cart";
import { captureCart } from "@/lib/abandoned-cart-server";

// Checkout com e-mail preenchido: guarda o carrinho para o lembrete de carrinho abandonado.
// Responde sempre 204 (não diz se gravou, se o e-mail saiu da lista nem se a loja usa o recurso).
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return new NextResponse(null, { status: 204 });
  if (await rateLimit(req, store.id, "cart")) return new NextResponse(null, { status: 204 });
  const capture = parseCapture(await req.json().catch(() => null));
  if (capture) await captureCart(createAdminClient(), store.id, capture);
  return new NextResponse(null, { status: 204 });
}
