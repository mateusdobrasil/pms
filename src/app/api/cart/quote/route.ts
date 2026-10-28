import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreFromRequest } from "@/lib/request-store";
import { parseCartItems, priceCart } from "@/lib/orders";
import { getShippingOptions, getShippingSettings } from "@/lib/shipping";
import { shippingNeedsZip } from "@/lib/shipping-settings";
import { getPromotions } from "@/lib/promotions";
import { applyCoupon } from "@/lib/coupons-server";
import { rateLimit } from "@/lib/rate-limit";
import { campaignsOffered } from "@/lib/whatsapp-campaigns-server";
import { getBirthdayConfig } from "@/lib/birthday-server";
import { birthdayGift } from "@/lib/birthday";
import { abandonedCartEnabled } from "@/lib/abandoned-cart-server";

// Recalcula o carrinho (preços atuais, estoque) e, com CEP, cota o frete.
export async function POST(req: Request) {
  const store = await getStoreFromRequest(req);
  if (!store) return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const items = parseCartItems(body?.items);
  if (!items) return NextResponse.json({ lines: [], subtotalCents: 0, shippingOptions: [], shippingError: null, problems: [] });

  const { lines, subtotalCents, problems } = await priceCart(createAdminClient(), store.id, items);
  const zip = typeof body?.zip === "string" ? body.zip : null;
  // Cupom digitado no checkout: conferido aqui (com limite de tentativas, contra quem tenta adivinhar códigos).
  if (body?.coupon && lines.length) {
    const limited = await rateLimit(req, store.id, "coupon");
    if (limited) return limited;
  }
  const [shipping, promotions, coupon, whatsappOptIn, birthday, abandonedCart] = await Promise.all([
    lines.length
      ? getShippingOptions(store, lines, zip)
      : getShippingSettings(store.id).then((s) => ({ options: [], error: null, needsZip: shippingNeedsZip(s) })),
    getPromotions(store.id),
    body?.coupon && lines.length ? applyCoupon(createAdminClient(), store.id, body.coupon, subtotalCents) : null,
    campaignsOffered(createAdminClient(), store.id), // caixa "quero receber novidades no WhatsApp"
    getBirthdayConfig(createAdminClient(), store.id), // campo do aniversário (cupom de presente)
    abandonedCartEnabled(createAdminClient(), store.id), // aviso do lembrete de carrinho abaixo do e-mail
  ]);

  return NextResponse.json({
    lines,
    subtotalCents,
    shippingOptions: shipping.options,
    shippingError: shipping.error,
    shippingNeedsZip: shipping.needsZip,
    problems,
    pixDiscountPercent: promotions.pixDiscountPercent,
    freeShippingMinCents: promotions.freeShippingMinCents,
    whatsappOptIn,
    birthdayGift: birthday?.enabled ? birthdayGift(birthday) : null,
    abandonedCart,
    ...(coupon ? (coupon.ok ? { coupon: { code: coupon.coupon.code, label: coupon.coupon.label, discountCents: coupon.coupon.discountCents } } : { couponError: coupon.error }) : {}),
  });
}
