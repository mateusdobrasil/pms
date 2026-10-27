import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { isUuid } from "@/lib/validation";
import { optOut } from "@/lib/whatsapp-campaigns-server";

// "Não quero mais receber" (link no fim de cada campanha). POST, com clique: a prévia de link do WhatsApp não
// pode descadastrar ninguém sozinha.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  if (!isUuid(token)) return NextResponse.json({ error: "Link inválido" }, { status: 400 });
  await optOut(createAdminClient(), store.id, token);
  return NextResponse.json({ ok: true });
}
