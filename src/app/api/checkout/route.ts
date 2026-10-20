import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { createOrder } from "@/lib/orders";

// Cria o pedido (aguardando pagamento). O pagamento é feito depois em /pedido/<token>.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const result = await createOrder(createAdminClient(), store, body);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });

  return NextResponse.json({ token: result.token }, { status: 201 });
}
