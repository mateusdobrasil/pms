import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { parseCartItems, priceCart } from "@/lib/orders";
import { getShippingOptions } from "@/lib/shipping";

// Recalcula o carrinho (preços atuais, estoque e opções de entrega) para exibir no checkout.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const items = parseCartItems(body?.items);
  if (!items) return NextResponse.json({ lines: [], subtotalCents: 0, shippingOptions: [], problems: [] });

  const { lines, subtotalCents, problems } = await priceCart(createAdminClient(), store.id, items);
  const shippingOptions = lines.length ? await getShippingOptions(store, lines) : [];

  return NextResponse.json({ lines, subtotalCents, shippingOptions, problems });
}
