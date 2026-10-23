import "server-only";
import { cache } from "react";
import type { Store } from "@/lib/store";
import type { PricedLine } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { onlyDigits } from "@/lib/validation";
import { getPromotions } from "@/lib/promotions";
import {
  DEFAULT_SHIPPING,
  LOCAL_DELIVERY_NAME,
  findLocalArea,
  parseCarriers,
  shippingNeedsZip,
  type Carriers,
  type ShippingSettings,
} from "@/lib/shipping-settings";

export type ShippingOption = {
  id: string; // 'pickup', 'local' (entrega própria) ou 'me:<id do serviço no Melhor Envio>'
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  requiresAddress: boolean;
  originalPriceCents?: number; // preço antes do frete grátis (só para mostrar riscado)
};

// needsZip = false: a loja só tem retirada, e o checkout nem pede o CEP.
export type ShippingQuote = { options: ShippingOption[]; error: string | null; needsZip: boolean };

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
const byPrice = (a: ShippingOption, b: ShippingOption) => a.priceCents - b.priceCents;

// Cotações do Melhor Envio → opções de entrega, da mais barata à mais cara. Descarta as que vieram
// com erro (serviço não atende o CEP) e, em "Só Correios", as de outras transportadoras.
export function deliveryOptions(quotes: MeQuote[], carriers: Carriers): ShippingOption[] {
  if (carriers === "none") return [];
  return quotes
    .filter((q) => !q.error && (q.custom_price ?? q.price))
    .filter((q) => carriers !== "correios" || isCorreios(q))
    .map((q) => ({
      id: `me:${q.id}`,
      name: q.company?.name && !q.name.includes(q.company.name) ? `${q.company.name} ${q.name}` : q.name,
      priceCents: Math.round(Number(q.custom_price ?? q.price) * 100),
      deliveryDays: q.custom_delivery_time ?? q.delivery_time ?? null,
      requiresAddress: true,
    }))
    .filter((o) => Number.isFinite(o.priceCents) && o.priceCents >= 0)
    .sort(byPrice);
}

// Formas de entrega da loja. Consultas à parte (como getPromotions): sem o SQL 20261103000000 rodado,
// a loja segue com retirada + todas as transportadoras, como antes.
export const getShippingSettings = cache(async (storeId: string): Promise<ShippingSettings> => {
  const db = createAdminClient();
  const { data, error } = await db
    .from("stores")
    .select("shipping_pickup, shipping_carriers, local_delivery_enabled")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return DEFAULT_SHIPPING;

  let areas: ShippingSettings["areas"] = [];
  if (data.local_delivery_enabled) {
    const { data: rows } = await db
      .from("local_delivery_areas")
      .select("city, state, price_cents, delivery_days")
      .eq("store_id", storeId)
      .order("position");
    areas = (rows ?? []).map((r) => ({ city: r.city, state: r.state, priceCents: r.price_cents, deliveryDays: r.delivery_days }));
  }
  return {
    pickup: data.shipping_pickup,
    carriers: parseCarriers(data.shipping_carriers) ?? "all",
    localDelivery: data.local_delivery_enabled && areas.length > 0,
    areas,
  };
});

// Cidade e UF do CEP, pelo ViaCEP, no servidor: o preço da entrega própria não depende do que o navegador manda.
async function cityFromZip(zip: string): Promise<{ city: string; state: string } | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${zip}/json/`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro || !data?.localidade || !data?.uf) return null;
    return { city: data.localidade, state: data.uf };
  } catch {
    return null;
  }
}

// Resultado de cada forma de entrega para um CEP; combineShipping junta tudo e escolhe a mensagem.
export type CarrierResult =
  | { status: "off" } // loja sem transportadoras
  | { status: "unavailable" } // sem token do Melhor Envio ou sem CEP de origem
  | { status: "failed" }
  | { status: "ok"; options: ShippingOption[] };
export type LocalResult =
  | { status: "off" }
  | { status: "failed" } // não deu para descobrir a cidade do CEP
  | { status: "outside"; cities: string[] }
  | { status: "ok"; option: ShippingOption };

export function combineShipping(
  settings: Pick<ShippingSettings, "pickup" | "carriers">,
  carrier: CarrierResult,
  local: LocalResult,
  subtotalCents: number,
  freeShippingMinCents: number | null,
): ShippingQuote {
  const pickup = settings.pickup ? [PICKUP] : [];
  const result = (options: ShippingOption[], error: string | null = null) => ({ options, error, needsZip: true });

  const delivery = [...(carrier.status === "ok" ? carrier.options : []), ...(local.status === "ok" ? [local.option] : [])].sort(byPrice);
  if (delivery.length) {
    const error = carrier.status === "failed" ? "Não foi possível consultar as transportadoras agora. Tente de novo para ver mais opções." : null;
    return result([...applyFreeShipping(delivery, subtotalCents, freeShippingMinCents), ...pickup], error);
  }

  // Nenhuma entrega para este CEP.
  if (carrier.status === "failed" || local.status === "failed") {
    return result(pickup, `Não foi possível calcular a entrega agora. Tente de novo${pickup.length ? " ou escolha a retirada" : " em alguns minutos"}.`);
  }
  const carriersAnswered = carrier.status === "ok";
  const localAnswered = local.status === "outside";
  if (!carriersAnswered && !localAnswered) {
    // Loja ainda sem frete configurado: só a retirada (se ela for permitida).
    return pickup.length ? result(pickup) : result([], "A entrega ainda não está disponível nesta loja. Fale com a loja pelo WhatsApp.");
  }
  const orPickup = pickup.length ? " ou escolha a retirada" : "";
  if (localAnswered && !carriersAnswered) {
    const { cities } = local;
    const where = cities.length <= 5 ? ` A loja entrega em ${cities.join(", ")}.` : "";
    return result(pickup, `A loja não entrega neste CEP.${where} Confira o CEP${orPickup}.`);
  }
  const who = localAnswered
    ? "Não há entrega"
    : settings.carriers === "correios"
      ? "Os Correios não entregam"
      : "Nenhuma transportadora entrega";
  return result(pickup, `${who} neste CEP. Confira o CEP${orPickup}.`);
}

// Opções de entrega sempre calculadas no servidor. O pedido só aceita uma opção desta lista,
// então o preço do frete nunca vem do navegador.
export async function getShippingOptions(store: Store, lines: PricedLine[], zip?: string | null): Promise<ShippingQuote> {
  const settings = await getShippingSettings(store.id);
  const pickup = settings.pickup ? [PICKUP] : [];
  if (!shippingNeedsZip(settings)) return { options: pickup, error: null, needsZip: false };

  const to = onlyDigits(zip ?? "");
  if (to.length !== 8) return { options: pickup, error: null, needsZip: true };

  const [carrier, local, { freeShippingMinCents }] = await Promise.all([
    quoteCarriers(store, settings.carriers, lines, to),
    quoteLocal(settings, to),
    getPromotions(store.id),
  ]);
  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  return combineShipping(settings, carrier, local, subtotalCents, freeShippingMinCents);
}

async function quoteLocal(settings: ShippingSettings, zip: string): Promise<LocalResult> {
  if (!settings.localDelivery) return { status: "off" };
  const place = await cityFromZip(zip);
  if (!place) return { status: "failed" };
  const area = findLocalArea(settings.areas, place.city, place.state);
  if (!area) return { status: "outside", cities: settings.areas.map((a) => `${a.city}/${a.state}`) };
  return {
    status: "ok",
    option: { id: "local", name: LOCAL_DELIVERY_NAME, priceCents: area.priceCents, deliveryDays: area.deliveryDays, requiresAddress: true },
  };
}

async function quoteCarriers(store: Store, carriers: Carriers, lines: PricedLine[], to: string): Promise<CarrierResult> {
  if (carriers === "none") return { status: "off" };
  const from = onlyDigits(store.origin_zip ?? "");
  const { data: secret } = await createAdminClient()
    .from("store_secrets")
    .select("*") // "*" para funcionar antes e depois da migration melhor_envio_sandbox
    .eq("store_id", store.id)
    .maybeSingle();
  if (from.length !== 8 || !secret?.melhor_envio_token) return { status: "unavailable" };

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
      return { status: "failed" };
    }
    return { status: "ok", options: deliveryOptions((await res.json()) as MeQuote[], carriers) };
  } catch (err) {
    console.error("Erro ao cotar frete no Melhor Envio", err);
    return { status: "failed" };
  }
}
