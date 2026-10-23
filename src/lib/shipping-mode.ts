// Formas de entrega que o lojista escolhe em Configurações (coluna stores.shipping_mode).
// Fica fora de lib/shipping (server-only) porque o formulário do painel também usa a lista.

export type ShippingMode = "pickup" | "pickup_correios" | "pickup_me" | "me";

export const DEFAULT_SHIPPING_MODE: ShippingMode = "pickup_me";

export const SHIPPING_MODES: { value: ShippingMode; label: string; description: string }[] = [
  { value: "pickup", label: "Somente retirada na loja", description: "O cliente não informa CEP nem paga frete; busca o pedido na loja." },
  {
    value: "pickup_correios",
    label: "Retirada na loja ou Correios",
    description: "Mostra só PAC e SEDEX, cotados pelo Melhor Envio (com o desconto dele), além da retirada.",
  },
  {
    value: "pickup_me",
    label: "Retirada na loja ou Melhor Envio",
    description: "Mostra todas as transportadoras do Melhor Envio (Correios, Jadlog, Loggi e outras), além da retirada.",
  },
  { value: "me", label: "Somente Melhor Envio", description: "Todas as transportadoras do Melhor Envio, sem a opção de retirada." },
];

export function parseShippingMode(value: unknown): ShippingMode | null {
  return SHIPPING_MODES.some((m) => m.value === value) ? (value as ShippingMode) : null;
}

export const shippingModeAllowsPickup = (mode: ShippingMode) => mode !== "me";
export const shippingModeUsesMelhorEnvio = (mode: ShippingMode) => mode !== "pickup";
