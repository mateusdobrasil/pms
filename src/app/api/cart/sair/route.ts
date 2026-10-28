import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isUuid } from "@/lib/validation";
import { markCartRecovered, optOutCart } from "@/lib/abandoned-cart-server";

// Links do lembrete de carrinho, sempre por POST com ação do cliente (a prévia de link não conta nem descadastra):
// { token } = "não quero mais lembretes"; { token, voltou: true } = abriu "Voltar ao carrinho".
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  if (!isUuid(token)) return NextResponse.json({ error: "Link inválido" }, { status: 400 });
  const db = createAdminClient();
  if (body?.voltou === true) await markCartRecovered(db, store.id, token);
  else await optOutCart(db, store.id, token);
  return NextResponse.json({ ok: true });
}
