import "server-only";
import type { Store } from "@/lib/store";
import type { PricedLine } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { onlyDigits } from "@/lib/validation";

export type ShippingOption = {
  id: string; // 'pickup' ou 'me:<id do serviço no Melhor Envio>'
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  requiresAddress: boolean;
};

export type ShippingQuote = { options: ShippingOption[]; error: string | null };

const PICKUP: ShippingOption = {
  id: "pickup",
  name: "Retirada na loja",
  priceCents: 0,
  deliveryDays: null,
  requiresAddress: false,
};

const ME_URL =
  process.env.MELHOR_ENVIO_ENV === "production" ? "https://melhorenvio.com.br" : "https://sandbox.melhorenvio.com.br";
// O Melhor Envio exige "Nome da aplicação (e-mail de contato técnico)".
const ME_USER_AGENT = `PMS app (${process.env.MELHOR_ENVIO_CONTACT ?? "contato@pmsapp.com.br"})`;

type MeQuote = {
  id: number;
  name: string;
  price?: string;
  custom_price?: string;
  custom_delivery_time?: number;
  delivery_time?: number;
  company?: { name: string };
  error?: string;
};

// Opções de entrega sempre calculadas no servidor. O pedido só aceita uma opção desta lista,
// então o preço do frete nunca vem do navegador.
export async function getShippingOptions(store: Store, lines: PricedLine[], zip?: string | null): Promise<ShippingQuote> {
  const to = onlyDigits(zip ?? "");
  if (to.length !== 8) return { options: [PICKUP], error: null };

  const from = onlyDigits(store.origin_zip ?? "");
  const { data: secret } = await createAdminClient()
    .from("store_secrets")
    .select("melhor_envio_token")
    .eq("store_id", store.id)
    .maybeSingle();
  if (from.length !== 8 || !secret?.melhor_envio_token) {
    // Loja ainda sem frete configurado: só retirada.
    return { options: [PICKUP], error: null };
  }

  try {
    const res = await fetch(`${ME_URL}/api/v2/me/shipment/calculate`, {
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
      return { options: [PICKUP], error: "Não foi possível calcular o frete agora. Tente de novo ou escolha a retirada." };
    }

    const quotes = (await res.json()) as MeQuote[];
    const delivery = quotes
      .filter((q) => !q.error && (q.custom_price ?? q.price))
      .map((q) => ({
        id: `me:${q.id}`,
        name: q.company?.name && !q.name.includes(q.company.name) ? `${q.company.name} ${q.name}` : q.name,
        priceCents: Math.round(Number(q.custom_price ?? q.price) * 100),
        deliveryDays: q.custom_delivery_time ?? q.delivery_time ?? null,
        requiresAddress: true,
      }))
      .filter((o) => Number.isFinite(o.priceCents) && o.priceCents >= 0)
      .sort((a, b) => a.priceCents - b.priceCents);

    if (delivery.length === 0) {
      return { options: [PICKUP], error: "Nenhuma transportadora entrega neste CEP. Confira o CEP ou escolha a retirada." };
    }
    return { options: [...delivery, PICKUP], error: null };
  } catch (err) {
    console.error("Erro ao cotar frete no Melhor Envio", err);
    return { options: [PICKUP], error: "Não foi possível calcular o frete agora. Tente de novo ou escolha a retirada." };
  }
}
