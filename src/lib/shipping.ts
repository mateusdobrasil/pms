import "server-only";
import type { Store } from "@/lib/store";
import type { PricedLine } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { onlyDigits } from "@/lib/validation";
import { getPromotions } from "@/lib/promotions";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import {
  DEFAULT_SHIPPING_MODE,
  parseShippingMode,
  shippingModeAllowsPickup,
  type ShippingMode,
} from "@/lib/shipping-mode";

export type ShippingOption = {
  id: string; // 'pickup' ou 'me:<id do serviço no Melhor Envio>'
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  requiresAddress: boolean;
  originalPriceCents?: number; // preço antes do frete grátis (só para mostrar riscado)
};

export type ShippingQuote = { options: ShippingOption[]; error: string | null; mode: ShippingMode };

const PICKUP: ShippingOption = {
  id: "pickup",
  name: "Retirada na loja",
  priceCents: 0,
  deliveryDays: null,
  requiresAddress: false,
};

// Frete grátis acima do valor configurado: vale para a opção mais barata (as outras seguem pagas).
// "delivery" vem ordenado do mais barato ao mais caro.
export function applyFreeShipping(delivery: ShippingOption[], subtotalCents: number, freeShippingMinCents: number | null) {
  if (!freeShippingMinCents || subtotalCents < freeShippingMinCents || !delivery[0] || delivery[0].priceCents === 0) {
    return delivery;
  }
  return [{ ...delivery[0], originalPriceCents: delivery[0].priceCents, priceCents: 0 }, ...delivery.slice(1)];
}

// Ambiente por loja (store_secrets.melhor_envio_sandbox); sem a coluna, vale MELHOR_ENVIO_ENV.
function meBaseUrl(sandbox: boolean | undefined) {
  const useSandbox = typeof sandbox === "boolean" ? sandbox : process.env.MELHOR_ENVIO_ENV !== "production";
  return useSandbox ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
}
// O Melhor Envio exige "Nome da aplicação (e-mail de contato técnico)".
const ME_USER_AGENT = `PMS app (${process.env.MELHOR_ENVIO_CONTACT ?? "contato@pmsapp.dev"})`;

export type MeQuote = {
  id: number;
  name: string;
  price?: string;
  custom_price?: string;
  custom_delivery_time?: number;
  delivery_time?: number;
  company?: { id?: number; name: string };
  error?: string;
};

// No Melhor Envio, a empresa de id 1 é os Correios (PAC, SEDEX, Mini Envios).
const isCorreios = (q: MeQuote) => q.company?.id === 1 || /correios/i.test(q.company?.name ?? "");

// Cotações do Melhor Envio → opções de entrega, da mais barata à mais cara. Descarta as que vieram
// com erro (serviço não atende o CEP) e, em "Retirada ou Correios", as de outras transportadoras.
export function deliveryOptions(quotes: MeQuote[], mode: ShippingMode): ShippingOption[] {
  return quotes
    .filter((q) => !q.error && (q.custom_price ?? q.price))
    .filter((q) => mode !== "pickup_correios" || isCorreios(q))
    .map((q) => ({
      id: `me:${q.id}`,
      name: q.company?.name && !q.name.includes(q.company.name) ? `${q.company.name} ${q.name}` : q.name,
      priceCents: Math.round(Number(q.custom_price ?? q.price) * 100),
      deliveryDays: q.custom_delivery_time ?? q.delivery_time ?? null,
      requiresAddress: true,
    }))
    .filter((o) => Number.isFinite(o.priceCents) && o.priceCents >= 0)
    .sort((a, b) => a.priceCents - b.priceCents);
}

// Forma de entrega escolhida pelo lojista. Consulta à parte (como getPromotions): sem o SQL
// 20261102000000 rodado, a loja segue com retirada + Melhor Envio, como antes.
export const getShippingMode = cache(async (storeId: string): Promise<ShippingMode> => {
  const { data, error } = await createPublicClient().from("stores").select("shipping_mode").eq("id", storeId).maybeSingle();
  if (error || !data) return DEFAULT_SHIPPING_MODE;
  return parseShippingMode(data.shipping_mode) ?? DEFAULT_SHIPPING_MODE;
});

// Opções de entrega sempre calculadas no servidor. O pedido só aceita uma opção desta lista,
// então o preço do frete nunca vem do navegador.
export async function getShippingOptions(store: Store, lines: PricedLine[], zip?: string | null): Promise<ShippingQuote> {
  const mode = await getShippingMode(store.id);
  const pickup = shippingModeAllowsPickup(mode) ? [PICKUP] : [];
  const result = (options: ShippingOption[], error: string | null = null): ShippingQuote => ({ options, error, mode });
  // Falhou a cotação: oferece a retirada quando a loja permite.
  const failed = (reason: string) =>
    result(pickup, pickup.length ? `${reason} Tente de novo ou escolha a retirada.` : `${reason} Tente de novo em alguns minutos.`);

  if (mode === "pickup") return result([PICKUP]);

  const to = onlyDigits(zip ?? "");
  if (to.length !== 8) return result(pickup);

  const from = onlyDigits(store.origin_zip ?? "");
  const { data: secret } = await createAdminClient()
    .from("store_secrets")
    .select("*") // "*" para funcionar antes e depois da migration melhor_envio_sandbox
    .eq("store_id", store.id)
    .maybeSingle();
  if (from.length !== 8 || !secret?.melhor_envio_token) {
    // Loja ainda sem frete configurado: só a retirada (se ela for permitida).
    return pickup.length ? result(pickup) : result([], "A entrega ainda não está disponível nesta loja. Fale com a loja pelo WhatsApp.");
  }

  try {
    const res = await fetch(`${meBaseUrl(secret.melhor_envio_sandbox)}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret.melhor_envio_token}`,
        "User-Agent": ME_USER_AGENT,
      },
      body: JSON.stringify({
        from: { postal_code: from },
        to: { postal_code: to },
        products: lines.map((l) => ({
          id: l.variantId,
          width: Math.ceil(l.widthCm),
          height: Math.ceil(l.heightCm),
          length: Math.ceil(l.lengthCm),
          weight: l.weightG / 1000,
          insurance_value: l.unitPriceCents / 100,
          quantity: l.quantity,
        })),
        options: { receipt: false, own_hand: false },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("Melhor Envio respondeu", res.status, await res.text().catch(() => ""));
      return failed("Não foi possível calcular o frete agora.");
    }

    const delivery = deliveryOptions((await res.json()) as MeQuote[], mode);

    if (delivery.length === 0) {
      const who = mode === "pickup_correios" ? "Os Correios não entregam" : "Nenhuma transportadora entrega";
      return result(pickup, `${who} neste CEP. Confira o CEP${pickup.length ? " ou escolha a retirada" : ""}.`);
    }

    const { freeShippingMinCents } = await getPromotions(store.id);
    const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
    return result([...applyFreeShipping(delivery, subtotalCents, freeShippingMinCents), ...pickup]);
  } catch (err) {
    console.error("Erro ao cotar frete no Melhor Envio", err);
    return failed("Não foi possível calcular o frete agora.");
  }
}
