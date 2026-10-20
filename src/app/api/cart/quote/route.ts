import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { parseCartItems, priceCart } from "@/lib/orders";
import { getShippingOptions } from "@/lib/shipping";

// Recalcula o carrinho (preços atuais, estoque) e, com CEP, cota o frete.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const items = parseCartItems(body?.items);
  if (!items) return NextResponse.json({ lines: [], subtotalCents: 0, shippingOptions: [], shippingError: null, problems: [] });

  const { lines, subtotalCents, problems } = await priceCart(createAdminClient(), store.id, items);
  const zip = typeof body?.zip === "string" ? body.zip : null;
  const shipping = lines.length ? await getShippingOptions(store, lines, zip) : { options: [], error: null };

  return NextResponse.json({
    lines,
    subtotalCents,
    shippingOptions: shipping.options,
    shippingError: shipping.error,
    problems,
  });
}
