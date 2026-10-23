// Formas de entrega que o lojista combina em Configurações → Entrega (colunas shipping_pickup,
// shipping_carriers e local_delivery_enabled de stores, mais a tabela local_delivery_areas).
// Fica fora de lib/shipping (server-only) porque o formulário do painel também usa estas regras.

import { parseBRL } from "@/lib/money";

export type Carriers = "none" | "correios" | "all";

export type LocalArea = { city: string; state: string; priceCents: number; deliveryDays: number | null };

export type ShippingSettings = {
  pickup: boolean;
  carriers: Carriers;
  localDelivery: boolean;
  areas: LocalArea[];
};

// Sem o SQL 20261103000000 rodado: retirada + todas as transportadoras (o comportamento original).
export const DEFAULT_SHIPPING: ShippingSettings = { pickup: true, carriers: "all", localDelivery: false, areas: [] };

export const CARRIER_OPTIONS: { value: Carriers; label: string; description: string }[] = [
  { value: "none", label: "Nenhuma", description: "Sem Correios nem transportadoras." },
  { value: "correios", label: "Só Correios", description: "PAC e SEDEX, cotados pelo Melhor Envio (com o desconto dele)." },
  { value: "all", label: "Todas do Melhor Envio", description: "Correios, Jadlog, Loggi e as outras transportadoras do Melhor Envio." },
];

// Nome gravado em orders.shipping_method na entrega própria (aparece assim no pedido, nos e-mails e na planilha).
export const LOCAL_DELIVERY_NAME = "Entrega da loja";
export const isLocalDelivery = (shippingMethod: string | null | undefined) => shippingMethod === LOCAL_DELIVERY_NAME;

export function parseCarriers(value: unknown): Carriers | null {
  return value === "none" || value === "correios" || value === "all" ? value : null;
}

// O cliente só precisa informar o CEP se houver alguma entrega na casa dele.
export const shippingNeedsZip = (s: Pick<ShippingSettings, "carriers" | "localDelivery">) =>
  s.carriers !== "none" || s.localDelivery;

// "São Paulo" = "sao paulo" = "SAO  PAULO": ignora acentos, maiúsculas e espaços repetidos.
export function normalizeCity(city: string) {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function findLocalArea(areas: LocalArea[], city: string, state: string) {
  const key = normalizeCity(city);
  return areas.find((a) => a.state === state.toUpperCase() && normalizeCity(a.city) === key) ?? null;
}

export const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export const MAX_LOCAL_AREAS = 50;

// Cidades vindas do formulário (JSON). Preço em reais ("10,00"; vazio ou 0 = grátis), prazo em dias.
export function parseLocalAreas(json: string): { areas: LocalArea[]; error?: string } {
  let rows: unknown;
  try {
    rows = JSON.parse(json || "[]");
  } catch {
    return { areas: [], error: "Lista de cidades inválida." };
  }
  if (!Array.isArray(rows)) return { areas: [], error: "Lista de cidades inválida." };

  const areas: LocalArea[] = [];
  const seen = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    const city = String(row?.city ?? "").trim().replace(/\s+/g, " ");
    const state = String(row?.state ?? "").trim().toUpperCase();
    const priceText = String(row?.price ?? "").trim();
    const daysText = String(row?.days ?? "").trim();
    if (!city && !priceText && !daysText) continue; // linha vazia: ignora

    if (city.length < 2 || city.length > 60) return { areas: [], error: "Entrega própria: informe o nome de cada cidade." };
    if (!UFS.has(state)) return { areas: [], error: `Entrega própria: UF inválida em ${city}.` };
    const priceCents = priceText === "" ? 0 : parseBRL(priceText);
    if (priceCents === null) return { areas: [], error: `Entrega própria: preço inválido em ${city}. Use o formato 10,00.` };
    const days = daysText === "" ? null : Number(daysText);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 30)) {
      return { areas: [], error: `Entrega própria: prazo inválido em ${city} (de 0 a 30 dias).` };
    }
    const key = `${state}|${normalizeCity(city)}`;
    if (seen.has(key)) return { areas: [], error: `Entrega própria: ${city}/${state} aparece duas vezes.` };
    seen.add(key);
    areas.push({ city, state, priceCents, deliveryDays: days });
  }
  if (areas.length > MAX_LOCAL_AREAS) return { areas: [], error: `Entrega própria: até ${MAX_LOCAL_AREAS} cidades.` };
  return { areas };
}
