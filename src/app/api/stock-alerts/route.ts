import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { rateLimit } from "@/lib/rate-limit";
import { isEmail, isUuid } from "@/lib/validation";

// "Avise-me quando chegar": guarda o e-mail do cliente para uma opção esgotada desta loja.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const limited = await rateLimit(req, store.id, "stockAlert");
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { variantId?: unknown; email?: unknown } | null;
  const variantId = String(body?.variantId ?? "");
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!isUuid(variantId)) return NextResponse.json({ error: "Opção inválida." }, { status: 400 });
  if (!isEmail(email) || email.length > 254) return NextResponse.json({ error: "Digite um e-mail válido." }, { status: 400 });

  const db = createAdminClient();
  // A opção precisa ser desta loja, estar à venda e esgotada.
  const { data: variant } = await db
    .from("product_variants")
    .select("id, stock, active, products!inner(active)")
    .eq("id", variantId)
    .eq("store_id", store.id)
    .maybeSingle();
  const product = variant?.products as unknown as { active: boolean } | undefined;
  if (!variant || !variant.active || !product?.active) return NextResponse.json({ error: "Opção indisponível." }, { status: 404 });
  if (variant.stock > 0) return NextResponse.json({ error: "Esta opção já voltou ao estoque. Atualize a página para comprar." }, { status: 409 });

  const { error } = await db.from("stock_alerts").insert({ store_id: store.id, variant_id: variantId, email });
  // Já estava na lista: para o cliente, dá no mesmo.
  if (error && error.code !== "23505") {
    console.error("Avise-me não salvo", { storeId: store.id, error: error.message });
    return NextResponse.json({ error: "Não foi possível salvar agora. Tente de novo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
